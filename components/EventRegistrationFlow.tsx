import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  LayoutAnimation,
  Keyboard,
  LayoutChangeEvent,
} from 'react-native';
import { Text, IconButton, useTheme, RadioButton, Checkbox } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeToggle } from '../app/_layout';
import type { Event, Question, ResponseType } from '../lib/firebase';
import { getEventQuestionnaire } from '../lib/firebase';
import GlassDateTimePicker from './GlassDateTimePicker';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_HEIGHT = Math.round(SCREEN_HEIGHT * 0.92);

export interface RegistrationData {
  questionnaireResponses?: Array<{
    questionId: string;
    questionText: string;
    responseType: ResponseType;
    answer: string | string[];
    isPublic: boolean;
  }>;
  waiverInitials?: string;
}

interface EventRegistrationFlowProps {
  visible: boolean;
  event: Event;
  userId: string;
  userName: string;
  userEmail: string;
  onComplete: (registrationData: RegistrationData) => void;
  onDismiss: () => void;
}

interface QuestionResponse {
  questionId: string;
  questionText: string;
  responseType: ResponseType;
  answer: string | string[];
  isPublic: boolean;
}

type Step = 'questionnaire' | 'waiver';

export default function EventRegistrationFlow({
  visible,
  event,
  userId,
  userName,
  userEmail,
  onComplete,
  onDismiss,
}: EventRegistrationFlowProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  // Animation refs
  const slideAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(0)).current;

  // State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Map<string, QuestionResponse>>(new Map());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsInitialized, setQuestionsInitialized] = useState(false);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Waiver state
  const [waiverScrolledToBottom, setWaiverScrolledToBottom] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [waiverInitials, setWaiverInitials] = useState('');
  const waiverContainerHeight = useRef(0);
  const waiverContentHeight = useRef(0);

  // Animations for waiver hints
  const waiverHintOpacity = useRef(new Animated.Value(1)).current;
  const waiverAgreementOpacity = useRef(new Animated.Value(0.4)).current;

  // Field position tracking for scroll-to-field
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<{ [key: string]: number }>({});

  // Build steps based on event config
  useEffect(() => {
    const newSteps: Step[] = [];
    if (event.hasQuestionnaire) {
      newSteps.push('questionnaire');
    }
    if (event.hasWaiver) {
      newSteps.push('waiver');
    }
    setSteps(newSteps);
  }, [event.hasQuestionnaire, event.hasWaiver]);

  // Load questions when visible
  useEffect(() => {
    if (visible && event.hasQuestionnaire) {
      loadQuestions();
    }
  }, [visible, event.id, event.hasQuestionnaire]);

  // Animate layout changes when keyboard shows/hides
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Scroll to field handlers
  const handleFieldLayout = useCallback((fieldId: string) => (event: LayoutChangeEvent) => {
    fieldPositions.current[fieldId] = event.nativeEvent.layout.y;
  }, []);

  const handleFieldFocus = useCallback((fieldId: string) => {
    const y = fieldPositions.current[fieldId];
    if (y !== undefined && scrollViewRef.current) {
      const scrollOffset = Math.max(0, y - 100);
      scrollViewRef.current.scrollTo({ y: scrollOffset, animated: true });
    }
  }, []);

  // Open/close animations
  useEffect(() => {
    if (visible) {
      // Reset state
      setCurrentStepIndex(0);
      setQuestions([]);
      setResponses(new Map());
      setWaiverScrolledToBottom(false);
      setWaiverAgreed(false);
      setWaiverInitials('');
      setErrors(new Map());
      setLoadingQuestions(false);
      setQuestionsInitialized(false);
      slideX.setValue(0);
      waiverHintOpacity.setValue(1);
      waiverAgreementOpacity.setValue(0.4);
      waiverContainerHeight.current = 0;
      waiverContentHeight.current = 0;

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const result = await getEventQuestionnaire(event.id);
      if (result.success && result.questions) {
        setQuestions(result.questions);
        // Initialize responses
        const initialResponses = new Map<string, QuestionResponse>();
        result.questions.forEach((q) => {
          initialResponses.set(q.id, {
            questionId: q.id,
            questionText: q.text,
            responseType: q.responseType,
            answer: q.responseType === 'multiple_choice' ? [] : '',
            isPublic: q.isPublic,
          });
        });
        setResponses(initialResponses);
      }
    } catch (error) {
      console.error('[EventRegistration] Error loading questions:', error);
    } finally {
      setLoadingQuestions(false);
      setQuestionsInitialized(true);
    }
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: MODAL_HEIGHT,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const updateResponse = (questionId: string, answer: string | string[]) => {
    setResponses((prev) => {
      const newResponses = new Map(prev);
      const existing = newResponses.get(questionId);
      if (existing) {
        newResponses.set(questionId, { ...existing, answer });
      }
      return newResponses;
    });
    // Clear error when user provides input
    setErrors((prev) => {
      const newErrors = new Map(prev);
      newErrors.delete(questionId);
      return newErrors;
    });
  };

  const validateCurrentStep = (): boolean => {
    const currentStep = steps[currentStepIndex];

    if (currentStep === 'questionnaire') {
      const newErrors = new Map<string, string>();
      let isValid = true;

      questions.forEach((q) => {
        const response = responses.get(q.id);
        const answer = response?.answer;
        const hasAnswer = answer && (Array.isArray(answer) ? answer.length > 0 : answer !== '');

        // Required field check
        if (q.required && !hasAnswer) {
          newErrors.set(q.id, 'This field is required');
          isValid = false;
          return; // Skip format validation if empty and required
        }

        // Format validation (runs if answer is provided, regardless of required status)
        if (hasAnswer && typeof answer === 'string') {
          // Email validation
          if (q.responseType === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(answer)) {
              newErrors.set(q.id, 'Please enter a valid email');
              isValid = false;
            }
          }

          // Phone validation - must contain at least 10 digits
          if (q.responseType === 'phone') {
            const digitsOnly = answer.replace(/\D/g, '');
            if (digitsOnly.length < 10 || digitsOnly.length > 15) {
              newErrors.set(q.id, 'Please enter a valid phone number (10-15 digits)');
              isValid = false;
            }
          }

          // Number validation
          if (q.responseType === 'number') {
            if (isNaN(parseFloat(answer))) {
              newErrors.set(q.id, 'Please enter a valid number');
              isValid = false;
            }
          }
        }
      });

      setErrors(newErrors);
      return isValid;
    }

    if (currentStep === 'waiver') {
      return waiverScrolledToBottom && waiverAgreed && waiverInitials.length > 0;
    }

    return true;
  };

  const handleNext = async () => {
    if (!validateCurrentStep()) return;

    if (currentStepIndex < steps.length - 1) {
      // Animate slide to next step
      const nextIndex = currentStepIndex + 1;
      Animated.timing(slideX, {
        toValue: -nextIndex * SCREEN_WIDTH,
        duration: 300,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
      setCurrentStepIndex(nextIndex);
    } else {
      // Final step - complete registration
      await completeRegistration();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      // Animate slide back to previous step
      const prevIndex = currentStepIndex - 1;
      Animated.timing(slideX, {
        toValue: -prevIndex * SCREEN_WIDTH,
        duration: 300,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
      setCurrentStepIndex(prevIndex);
    }
  };

  const completeRegistration = async () => {
    setLoading(true);
    try {
      // Collect registration data to pass to parent
      // Data will only be saved AFTER successful event join
      const registrationData: RegistrationData = {};

      if (event.hasQuestionnaire && responses.size > 0) {
        registrationData.questionnaireResponses = Array.from(responses.values());
      }

      if (event.hasWaiver && waiverInitials) {
        registrationData.waiverInitials = waiverInitials;
      }

      // Pass data to parent - parent will save after successful join
      onComplete(registrationData);
      handleClose();
    } catch (error) {
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWaiverScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isAtBottom && !waiverScrolledToBottom) {
      markWaiverAsRead();
    }
  };

  // Check if waiver content fits without scrolling (auto-pass scroll check)
  const checkWaiverContentFits = () => {
    if (waiverScrolledToBottom) return; // Already passed
    if (waiverContainerHeight.current > 0 && waiverContentHeight.current > 0) {
      // If content fits within container (with small buffer), auto-pass
      if (waiverContentHeight.current <= waiverContainerHeight.current + 10) {
        markWaiverAsRead();
      }
    }
  };

  const markWaiverAsRead = () => {
    setWaiverScrolledToBottom(true);
    // Animate hint fade out and agreement fade in
    Animated.parallel([
      Animated.timing(waiverHintOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(waiverAgreementOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleWaiverLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    waiverContainerHeight.current = e.nativeEvent.layout.height;
    checkWaiverContentFits();
  };

  const handleWaiverContentSizeChange = (_width: number, height: number) => {
    waiverContentHeight.current = height;
    checkWaiverContentFits();
  };

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  // Check if all required questions are answered
  const areRequiredQuestionsAnswered = () => {
    // Don't enable button until questions are loaded
    if (!questionsInitialized) return false;
    if (questions.length === 0) return false;

    for (const question of questions) {
      if (!question.required) continue; // Skip optional questions

      const response = responses.get(question.id);
      const answer = response?.answer;

      // Check if answer exists and is not empty
      if (!answer) return false;
      if (Array.isArray(answer) && answer.length === 0) return false;
      if (typeof answer === 'string' && answer.trim() === '') return false;
    }
    return true;
  };

  const canContinue =
    currentStep === 'questionnaire'
      ? areRequiredQuestionsAnswered()
      : waiverScrolledToBottom && waiverAgreed && waiverInitials.length > 0;

  // Render question input based on type
  const renderQuestionInput = (question: Question) => {
    const response = responses.get(question.id);
    const answer = response?.answer ?? '';
    const error = errors.get(question.id);

    const inputStyle = [
      styles.textInput,
      {
        color: theme.colors.onSurface,
        borderColor: error ? '#EF4444' : theme.colors.outline,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      },
    ];

    switch (question.responseType) {
      case 'text':
        return (
          <TextInput
            value={answer as string}
            onChangeText={(text) => updateResponse(question.id, text)}
            onFocus={() => handleFieldFocus(question.id)}
            placeholder="Your answer"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
            style={inputStyle}
          />
        );

      case 'long_text':
        return (
          <TextInput
            value={answer as string}
            onChangeText={(text) => updateResponse(question.id, text)}
            onFocus={() => handleFieldFocus(question.id)}
            placeholder="Your answer"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
            style={[inputStyle, styles.textArea]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        );

      case 'email':
        return (
          <TextInput
            value={answer as string}
            onChangeText={(text) => updateResponse(question.id, text)}
            onFocus={() => handleFieldFocus(question.id)}
            placeholder="email@example.com"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
            style={inputStyle}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        );

      case 'phone':
        return (
          <TextInput
            value={answer as string}
            onChangeText={(text) => updateResponse(question.id, text)}
            onFocus={() => handleFieldFocus(question.id)}
            placeholder="(555) 123-4567"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
            style={inputStyle}
            keyboardType="phone-pad"
          />
        );

      case 'number':
        return (
          <TextInput
            value={answer as string}
            onChangeText={(text) => updateResponse(question.id, text.replace(/[^0-9.-]/g, ''))}
            onFocus={() => handleFieldFocus(question.id)}
            placeholder="0"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
            style={inputStyle}
            keyboardType="numeric"
          />
        );

      case 'date':
        return (
          <GlassDateTimePicker
            label="Select Date"
            date={answer ? new Date(answer as string) : new Date()}
            onDateChange={(date) => updateResponse(question.id, date.toISOString())}
            onOpen={() => handleFieldFocus(question.id)}
          />
        );

      case 'single_choice':
        return (
          <View style={styles.choicesContainer}>
            {(question.choices || []).map((choice, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => updateResponse(question.id, choice)}
                style={[
                  styles.choiceOption,
                  {
                    borderColor: answer === choice ? theme.colors.primary : theme.colors.outline,
                    backgroundColor: answer === choice
                      ? isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'
                      : 'transparent',
                  },
                ]}
              >
                <RadioButton
                  value={choice}
                  status={answer === choice ? 'checked' : 'unchecked'}
                  onPress={() => updateResponse(question.id, choice)}
                  color={theme.colors.primary}
                />
                <Text style={[styles.choiceText, { color: theme.colors.onSurface }]}>
                  {choice}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'multiple_choice':
        const selectedChoices = (answer as string[]) || [];
        return (
          <View style={styles.choicesContainer}>
            {(question.choices || []).map((choice, index) => {
              const isSelected = selectedChoices.includes(choice);
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    const newSelection = isSelected
                      ? selectedChoices.filter((c) => c !== choice)
                      : [...selectedChoices, choice];
                    updateResponse(question.id, newSelection);
                  }}
                  style={[
                    styles.choiceOption,
                    {
                      borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
                      backgroundColor: isSelected
                        ? isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'
                        : 'transparent',
                    },
                  ]}
                >
                  <Checkbox
                    status={isSelected ? 'checked' : 'unchecked'}
                    onPress={() => {
                      const newSelection = isSelected
                        ? selectedChoices.filter((c) => c !== choice)
                        : [...selectedChoices, choice];
                      updateResponse(question.id, newSelection);
                    }}
                    color={theme.colors.primary}
                  />
                  <Text style={[styles.choiceText, { color: theme.colors.onSurface }]}>
                    {choice}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      default:
        return null;
    }
  };

  // Progress indicator
  const renderProgressIndicator = () => {
    if (steps.length <= 1) return null;

    return (
      <View style={styles.progressContainer}>
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          return (
            <View key={step} style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: isCompleted
                      ? '#10B981'
                      : isCurrent
                      ? theme.colors.primary
                      : theme.colors.outline,
                  },
                ]}
              >
                {isCompleted && (
                  <MaterialCommunityIcons name="check" size={12} color="#fff" />
                )}
              </View>
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.progressLine,
                    {
                      backgroundColor: isCompleted ? '#10B981' : theme.colors.outline,
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // Questionnaire step
  const renderQuestionnaireStep = () => (
    <ScrollView
      ref={scrollViewRef}
      style={styles.stepContent}
      contentContainerStyle={styles.stepContentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {/* Header with icon */}
      <View style={styles.questionnaireHeader}>
        <IconButton
          icon="clipboard-text-outline"
          size={28}
          iconColor={isDark ? '#60A5FA' : '#1B365D'}
          style={{ margin: 0 }}
        />
        <Text style={[styles.questionnaireTitle, { color: isDark ? '#FFFFFF' : '#1B365D' }]}>
          {event.questionnaireTitle || 'Registration Questions'}
        </Text>
      </View>

      <Text style={[styles.questionnaireSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
        Please answer the following questions to complete your registration
      </Text>

      {questions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
            No questions found for this event.
          </Text>
        </View>
      ) : questions.map((question) => (
        <View
          key={question.id}
          style={styles.questionContainer}
          onLayout={handleFieldLayout(question.id)}
        >
          <View style={styles.questionHeader}>
            <Text style={[styles.questionText, { color: isDark ? '#FFFFFF' : '#374151' }]}>
              {question.text}
            </Text>
            {question.required && (
              <Text style={styles.requiredBadge}>Required</Text>
            )}
          </View>
          {renderQuestionInput(question)}
          {errors.get(question.id) && (
            <Text style={styles.errorText}>{errors.get(question.id)}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );

  // Waiver step
  const renderWaiverStep = () => (
    <View style={styles.stepContent}>
      {/* Header with icon */}
      <View style={styles.waiverHeader}>
        <IconButton
          icon="file-document-outline"
          size={28}
          iconColor={isDark ? '#60A5FA' : '#1B365D'}
          style={{ margin: 0 }}
        />
        <Text style={[styles.waiverTitle, { color: isDark ? '#FFFFFF' : '#1B365D' }]}>
          Event Waiver
        </Text>
      </View>

      <Text style={[styles.waiverSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
        Please read and agree to the following terms before joining this event
      </Text>

      {/* Waiver text container */}
      <ScrollView
        style={[
          styles.waiverTextContainer,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB' },
        ]}
        onScroll={handleWaiverScroll}
        onLayout={handleWaiverLayout}
        onContentSizeChange={handleWaiverContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
        persistentScrollbar
        nestedScrollEnabled
      >
        <Text style={[styles.waiverText, { color: isDark ? 'rgba(255,255,255,0.9)' : '#374151' }]}>
          {event.waiverText || 'No waiver text provided.'}
        </Text>
      </ScrollView>

      {/* Scroll hint */}
      <Animated.Text
        style={[
          styles.waiverScrollHint,
          {
            color: isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF',
            opacity: waiverHintOpacity,
          },
        ]}
      >
        ↓ Scroll to read entire waiver
      </Animated.Text>

      {/* Agreement section */}
      <Animated.View
        style={[
          styles.waiverAgreementSection,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
            opacity: waiverAgreementOpacity,
          },
        ]}
      >
        {/* Checkbox row */}
        <TouchableOpacity
          style={[
            styles.waiverCheckboxRow,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
              borderColor: waiverAgreed
                ? isDark ? '#60A5FA' : '#1B365D'
                : isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB',
            },
          ]}
          onPress={() => waiverScrolledToBottom && setWaiverAgreed(!waiverAgreed)}
          activeOpacity={waiverScrolledToBottom ? 0.7 : 1}
          disabled={!waiverScrolledToBottom}
        >
          <IconButton
            icon={waiverAgreed ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            iconColor={
              waiverAgreed
                ? isDark ? '#60A5FA' : '#1B365D'
                : isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF'
            }
            style={{ margin: 0 }}
          />
          <Text style={[styles.waiverCheckboxText, { color: isDark ? '#FFFFFF' : '#374151' }]}>
            I have read and agree to the terms above
          </Text>
        </TouchableOpacity>

        {/* Initials row */}
        <View style={styles.waiverInitialsRow}>
          <Text style={[styles.waiverInitialsLabel, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
            Sign with your initials
          </Text>
          <TextInput
            style={[
              styles.waiverInitialsInput,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                borderColor: waiverInitials.length > 0
                  ? isDark ? '#60A5FA' : '#1B365D'
                  : isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB',
                color: isDark ? '#FFFFFF' : '#1B365D',
              },
            ]}
            value={waiverInitials}
            onChangeText={(text) => waiverScrolledToBottom && setWaiverInitials(text)}
            editable={waiverScrolledToBottom}
            placeholder="AB"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'}
            autoCapitalize="characters"
            maxLength={4}
          />
        </View>
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        />
      </TouchableOpacity>

      {/* Modal Content */}
      <Animated.View
        style={[
          styles.modalContainer,
          {
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.colors.outline }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            {currentStepIndex > 0 ? (
              <IconButton
                icon="arrow-left"
                size={24}
                onPress={handleBack}
                iconColor={theme.colors.onSurface}
              />
            ) : (
              <IconButton
                icon="close"
                size={24}
                onPress={handleClose}
                iconColor={theme.colors.onSurface}
              />
            )}
            {renderProgressIndicator()}
            <View style={{ width: 48 }} />
          </View>

          {/* Content */}
          <KeyboardAvoidingView
            style={styles.content}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Show loading while loading questions */}
            {loadingQuestions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={isDark ? '#60A5FA' : '#1B365D'} />
                <Text style={[styles.loadingText, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                  Loading...
                </Text>
              </View>
            ) : (
              <Animated.View
                style={[
                  styles.slidingContainer,
                  {
                    width: SCREEN_WIDTH * Math.max(steps.length, 1),
                    transform: [{ translateX: slideX }],
                  },
                ]}
              >
                {steps.includes('questionnaire') && (
                  <View style={[styles.pageContainer, { width: SCREEN_WIDTH }]}>
                    {renderQuestionnaireStep()}
                  </View>
                )}
                {steps.includes('waiver') && (
                  <View style={[styles.pageContainer, { width: SCREEN_WIDTH }]}>
                    {renderWaiverStep()}
                  </View>
                )}
              </Animated.View>
            )}
          </KeyboardAvoidingView>

          {/* Footer - hide while loading */}
          {!loadingQuestions && (
          <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}>
            <View style={styles.footerButtonRow}>
              {/* Cancel button */}
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' },
                ]}
                onPress={currentStepIndex > 0 ? handleBack : handleClose}
              >
                <Text
                  style={[
                    styles.cancelButtonText,
                    { color: isDark ? 'rgba(255,255,255,0.8)' : '#6B7280' },
                  ]}
                >
                  {currentStepIndex > 0 ? 'Back' : 'Cancel'}
                </Text>
              </TouchableOpacity>

              {/* Continue button */}
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  {
                    backgroundColor: canContinue
                      ? isDark ? '#60A5FA' : '#1B365D'
                      : isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB',
                  },
                ]}
                onPress={handleNext}
                disabled={loading || !canContinue}
              >
                {loading ? (
                  <Text style={[styles.continueButtonText, { color: '#FFFFFF' }]}>...</Text>
                ) : (
                  <Text
                    style={[
                      styles.continueButtonText,
                      {
                        color: canContinue
                          ? '#FFFFFF'
                          : isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF',
                      },
                    ]}
                  >
                    {isLastStep ? 'Complete' : 'Continue'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: MODAL_HEIGHT,
  },
  modalContent: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressLine: {
    width: 32,
    height: 2,
    marginHorizontal: 4,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  slidingContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  pageContainer: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepContentContainer: {
    paddingBottom: 300,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },

  // Questionnaire styles
  questionnaireHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionnaireTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  questionnaireSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  questionContainer: {
    marginBottom: 24,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  questionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  requiredBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontWeight: '400' as const,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  choicesContainer: {
    gap: 8,
  },
  choiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingRight: 16,
  },
  choiceText: {
    flex: 1,
    fontSize: 15,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 6,
  },

  // Waiver styles
  waiverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  waiverTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  waiverSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  waiverTextContainer: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  waiverText: {
    fontSize: 14,
    lineHeight: 22,
  },
  waiverScrollHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  waiverAgreementSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  waiverCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  waiverCheckboxText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  waiverInitialsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  waiverInitialsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  waiverInitialsInput: {
    width: 80,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // Footer styles
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  footerButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
