import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeToggle } from '../app/_layout';
import GlassButton from './GlassButton';
import GlassSwitch from './GlassSwitch';
import QuestionCard from './QuestionCard';
import ResponseTypePicker from './ResponseTypePicker';
import type { Question, Questionnaire, ResponseType } from '../lib/firebase';
import { Timestamp } from 'firebase/firestore';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface QuestionnaireBuilderSheetProps {
  visible: boolean;
  questionnaire: Questionnaire | null;
  onDismiss: () => void;
  onSave: (questionnaire: Questionnaire) => void;
}

export default function QuestionnaireBuilderSheet({
  visible,
  questionnaire,
  onDismiss,
  onSave,
}: QuestionnaireBuilderSheetProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const [enabled, setEnabled] = useState(questionnaire?.enabled || false);
  const [questions, setQuestions] = useState<Question[]>(questionnaire?.questions || []);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [currentType, setCurrentType] = useState<ResponseType | null>(null);

  const generateQuestionId = () => {
    // Use crypto.randomUUID if available (modern Hermes), fallback to timestamp + random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `q_${crypto.randomUUID()}`;
    }
    // Fallback with more entropy
    const timestamp = Date.now().toString(36);
    const randomPart = Array.from({ length: 3 }, () =>
      Math.random().toString(36).substring(2, 8)
    ).join('');
    return `q_${timestamp}_${randomPart}`;
  };

  // Reset state when modal becomes visible
  useEffect(() => {
    if (visible) {
      const hasQuestions = questionnaire?.questions && questionnaire.questions.length > 0;
      setEnabled(questionnaire?.enabled || false);

      // If no questions exist, create one default question
      if (!hasQuestions) {
        const defaultQuestion: Question = {
          id: generateQuestionId(),
          text: '',
          responseType: 'text',
          required: false,
          isPublic: false,
          order: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        setQuestions([defaultQuestion]);
      } else {
        setQuestions(questionnaire.questions);
      }

      setShowTypePicker(false);
      setActiveQuestionId(null);
    }
  }, [visible, questionnaire]);

  const handleAddQuestion = () => {
    if (!enabled) return;

    const newQuestion: Question = {
      id: generateQuestionId(),
      text: '',
      responseType: 'text',
      required: false,
      isPublic: false,
      order: questions.length,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setQuestions([...questions, newQuestion]);
  };

  const handleUpdateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(
      questions.map((q) =>
        q.id === id ? { ...q, ...updates, updatedAt: Timestamp.now() } : q
      )
    );
  };

  const handleDeleteQuestion = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newQuestions = questions.filter((q) => q.id !== id);
    // Re-index order
    const reindexed = newQuestions.map((q, i) => ({ ...q, order: i }));
    setQuestions(reindexed);
  };

  const handleMoveUp = (id: string) => {
    const index = questions.findIndex((q) => q.id === id);
    if (index <= 0) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newQuestions = [...questions];
    [newQuestions[index - 1], newQuestions[index]] = [
      newQuestions[index],
      newQuestions[index - 1],
    ];
    // Re-index order
    const reindexed = newQuestions.map((q, i) => ({ ...q, order: i }));
    setQuestions(reindexed);
  };

  const handleMoveDown = (id: string) => {
    const index = questions.findIndex((q) => q.id === id);
    if (index >= questions.length - 1) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[index + 1]] = [
      newQuestions[index + 1],
      newQuestions[index],
    ];
    // Re-index order
    const reindexed = newQuestions.map((q, i) => ({ ...q, order: i }));
    setQuestions(reindexed);
  };

  const handleOpenTypePicker = (questionId: string, questionCurrentType: ResponseType) => {
    setActiveQuestionId(questionId);
    setCurrentType(questionCurrentType);
    setShowTypePicker(true);
  };

  const handleSelectResponseType = (type: ResponseType) => {
    if (activeQuestionId) {
      const updates: Partial<Question> = { responseType: type };

      // If changing to choice type, initialize choices
      if ((type === 'single_choice' || type === 'multiple_choice')) {
        updates.choices = ['', ''];
      } else {
        // If changing from choice type to non-choice, remove choices
        updates.choices = undefined;
      }

      handleUpdateQuestion(activeQuestionId, updates);
    }
    setShowTypePicker(false);
    setActiveQuestionId(null);
    setCurrentType(null);
  };

  const validateQuestionnaire = (): boolean => {
    if (!enabled) return true; // Can save if disabled

    if (questions.length === 0) {
      Alert.alert('Add Questions', 'Please add at least one question to the questionnaire');
      return false;
    }

    const emptyQuestions = questions.filter((q) => !q.text.trim());
    if (emptyQuestions.length > 0) {
      Alert.alert('Empty Questions', 'All questions must have text');
      return false;
    }

    const invalidChoiceQuestions = questions.filter(
      (q) =>
        (q.responseType === 'single_choice' || q.responseType === 'multiple_choice') &&
        (!q.choices || q.choices.length < 2 || q.choices.some((c) => !c.trim()))
    );
    if (invalidChoiceQuestions.length > 0) {
      Alert.alert(
        'Invalid Choices',
        'Choice questions must have at least 2 non-empty options'
      );
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateQuestionnaire()) return;

    onSave({
      enabled,
      questions,
    });
  };

  const handleClose = () => {
    // Check if there are unsaved changes
    const hasChanges = enabled !== (questionnaire?.enabled || false) ||
      questions.length !== (questionnaire?.questions?.length || 0) ||
      questions.some((q, i) => {
        const original = questionnaire?.questions?.[i];
        return !original || q.text !== original.text || q.responseType !== original.responseType;
      });

    if (hasChanges) {
      Alert.alert(
        'Discard Changes',
        'Are you sure you want to close without saving?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: onDismiss,
          },
        ]
      );
    } else {
      onDismiss();
    }
  };

  const isValid = () => {
    if (!enabled) return true;
    if (questions.length === 0) return false;
    if (questions.some((q) => !q.text.trim())) return false;
    const invalidChoices = questions.filter(
      (q) =>
        (q.responseType === 'single_choice' || q.responseType === 'multiple_choice') &&
        (!q.choices || q.choices.length < 2 || q.choices.some((c) => !c.trim()))
    );
    return invalidChoices.length === 0;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
            <IconButton
              icon="close"
              size={24}
              iconColor={theme.colors.onSurfaceVariant}
              onPress={handleClose}
              style={styles.closeButton}
            />
            <View style={styles.headerCenter}>
              <Text
                variant="titleMedium"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                Event Questionnaire
              </Text>
            </View>
            <View style={styles.headerRight} />
          </View>

          {/* Subtitle */}
          <View style={styles.subtitleContainer}>
            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Ask anything attendees should answer before joining
            </Text>
          </View>

          {/* Enable Toggle */}
          <View style={styles.toggleSection}>
            <GlassSwitch
              label="Enable Questionnaire"
              value={enabled}
              onValueChange={setEnabled}
            />
          </View>

          {/* Content */}
          <KeyboardAvoidingView
            style={styles.contentWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              indicatorStyle={isDark ? 'white' : 'black'}
            >
              {questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  totalQuestions={questions.length}
                  onUpdate={handleUpdateQuestion}
                  onDelete={handleDeleteQuestion}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onOpenTypePicker={handleOpenTypePicker}
                  disabled={!enabled}
                />
              ))}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.outline }]}>
            {/* Add Question Button - Left */}
            <View style={styles.footerButton}>
              <GlassButton
                title="Add Question"
                onPress={handleAddQuestion}
                variant="secondary"
                style={styles.pillButton}
                size="small"
                icon={<MaterialCommunityIcons name="plus" size={18} color={theme.colors.onSurface} />}
              />
            </View>
            {/* Done Button - Right */}
            <View style={styles.footerButton}>
              <GlassButton
                title="Done"
                onPress={handleSave}
                variant="primary"
                isReady={isValid()}
                style={styles.pillButton}
                size="small"
              />
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Response Type Picker (Nested Modal) */}
      <ResponseTypePicker
        visible={showTypePicker}
        currentType={currentType}
        onSelect={handleSelectResponseType}
        onDismiss={() => {
          setShowTypePicker(false);
          setActiveQuestionId(null);
          setCurrentType(null);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  closeButton: {
    margin: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 48, // Balance for close button
  },
  title: {
    fontWeight: '600',
  },
  subtitleContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
  },
  toggleSection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
  },
  pillButton: {
    marginVertical: 0,
    borderRadius: 20,
  },
});
