import { View, StyleSheet, TouchableOpacity, Alert, TextInput, LayoutChangeEvent } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { useThemeToggle } from '../app/_layout';
import type { Question, ResponseType } from '../lib/firebase';

interface QuestionCardProps {
  question: Question;
  index: number;
  totalQuestions: number;
  onUpdate: (id: string, updates: Partial<Question>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onOpenTypePicker: (questionId: string, currentType: ResponseType) => void;
  disabled?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  onFieldFocus?: () => void;
}

const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  text: 'Text',
  long_text: 'Long Text',
  phone: 'Phone',
  email: 'Email',
  number: 'Number',
  date: 'Date',
  single_choice: 'Single Choice',
  multiple_choice: 'Multiple Choice',
};

export default function QuestionCard({
  question,
  index,
  totalQuestions,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOpenTypePicker,
  disabled = false,
  onLayout,
  onFieldFocus,
}: QuestionCardProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const canMoveUp = index > 0;
  const canMoveDown = index < totalQuestions - 1;

  const handleTextChange = (text: string) => {
    onUpdate(question.id, { text });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Question',
      'Are you sure you want to delete this question?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(question.id),
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.container,
        disabled && styles.containerDisabled
      ]}
      onLayout={onLayout}
    >
      {/* Question Number and Actions */}
      <View style={styles.header}>
        <Text
          variant="labelSmall"
          style={[
            styles.questionNumber,
            {
              color: disabled
                ? isDark
                  ? 'rgba(255,255,255,0.3)'
                  : 'rgba(0,0,0,0.3)'
                : theme.colors.onSurfaceVariant,
            },
          ]}
        >
          Question {index + 1}
        </Text>

        <View style={styles.actionButtons}>
          {/* Move Up Button */}
          <IconButton
            icon="chevron-up"
            size={20}
            iconColor={disabled || !canMoveUp
              ? isDark
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(0,0,0,0.2)'
              : isDark
              ? 'rgba(255,255,255,0.5)'
              : 'rgba(0,0,0,0.5)'
            }
            onPress={() => !disabled && canMoveUp && onMoveUp(question.id)}
            style={{ margin: 0 }}
            disabled={disabled || !canMoveUp}
          />

          {/* Move Down Button */}
          <IconButton
            icon="chevron-down"
            size={20}
            iconColor={disabled || !canMoveDown
              ? isDark
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(0,0,0,0.2)'
              : isDark
              ? 'rgba(255,255,255,0.5)'
              : 'rgba(0,0,0,0.5)'
            }
            onPress={() => !disabled && canMoveDown && onMoveDown(question.id)}
            style={{ margin: 0 }}
            disabled={disabled || !canMoveDown}
          />

          {/* Delete Button */}
          <IconButton
            icon="delete"
            size={20}
            iconColor={disabled
              ? isDark
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(0,0,0,0.2)'
              : '#EF4444'
            }
            onPress={() => !disabled && handleDelete()}
            style={{ margin: 0 }}
            disabled={disabled}
          />
        </View>
      </View>

      {/* Question Text Input */}
      <TextInput
        value={question.text}
        onChangeText={handleTextChange}
        onFocus={onFieldFocus}
        placeholder="Enter your question"
        placeholderTextColor={
          disabled
            ? isDark
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(0,0,0,0.2)'
            : isDark
            ? 'rgba(255,255,255,0.4)'
            : 'rgba(0,0,0,0.4)'
        }
        editable={!disabled}
        style={[
          styles.input,
          {
            color: disabled
              ? isDark
                ? 'rgba(255,255,255,0.3)'
                : 'rgba(0,0,0,0.3)'
              : theme.colors.onSurface,
            borderBottomColor: disabled
              ? isDark
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.1)'
              : theme.colors.outlineVariant,
          },
        ]}
      />

      {/* Choice Options - Show for single/multiple choice */}
      {(question.responseType === 'single_choice' || question.responseType === 'multiple_choice') && (
        <View style={styles.choicesContainer}>
          {(question.choices || []).map((choice, choiceIndex) => (
            <View key={choiceIndex} style={styles.choiceRow}>
              <IconButton
                icon="drag-horizontal-variant"
                size={18}
                iconColor={disabled
                  ? isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                  : theme.colors.onSurfaceVariant
                }
                style={{ margin: 0, marginLeft: -8, marginRight: 4 }}
              />
              <TextInput
                value={choice}
                onChangeText={(text) => {
                  const newChoices = [...(question.choices || [])];
                  newChoices[choiceIndex] = text;
                  onUpdate(question.id, { choices: newChoices });
                }}
                onFocus={onFieldFocus}
                placeholder={`Option ${choiceIndex + 1}`}
                placeholderTextColor={
                  disabled
                    ? isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                    : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
                }
                editable={!disabled}
                style={[
                  styles.choiceInput,
                  {
                    color: disabled
                      ? isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
                      : theme.colors.onSurface,
                    borderBottomColor: disabled
                      ? isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                      : theme.colors.outlineVariant,
                  },
                ]}
              />
              {!disabled && (question.choices || []).length > 1 && (
                <IconButton
                  icon="close"
                  size={16}
                  iconColor={theme.colors.onSurfaceVariant}
                  onPress={() => {
                    const newChoices = (question.choices || []).filter((_, i) => i !== choiceIndex);
                    onUpdate(question.id, { choices: newChoices });
                  }}
                  style={{ margin: 0 }}
                />
              )}
            </View>
          ))}
          {!disabled && (
            <TouchableOpacity
              onPress={() => {
                const newChoices = [...(question.choices || []), ''];
                onUpdate(question.id, { choices: newChoices });
              }}
              style={styles.choiceRow}
              activeOpacity={0.7}
            >
              <View style={[
                styles.addChoiceIndicator,
                { borderColor: theme.colors.outline }
              ]}>
                <Text style={{ color: theme.colors.primary, fontSize: 16, fontWeight: '500' }}>+</Text>
              </View>
              <View style={[
                styles.addChoiceInput,
                { borderBottomColor: theme.colors.outlineVariant }
              ]}>
                <Text
                  style={{
                    fontSize: 14,
                    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                  }}
                >
                  Add option
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Options Row */}
      <View style={styles.optionsRow}>
        {/* Left: Response Type */}
        <TouchableOpacity
          onPress={() => !disabled && onOpenTypePicker(question.id, question.responseType)}
          activeOpacity={0.7}
          disabled={disabled}
          style={styles.responseTypeButton}
        >
          <Text
            variant="bodySmall"
            style={[
              styles.optionText,
              {
                color: disabled
                  ? isDark
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(0,0,0,0.3)'
                  : theme.colors.primary,
              },
            ]}
          >
            {RESPONSE_TYPE_LABELS[question.responseType]}
          </Text>
          <IconButton
            icon="chevron-down"
            size={16}
            iconColor={disabled
              ? isDark
                ? 'rgba(255,255,255,0.3)'
                : 'rgba(0,0,0,0.3)'
              : theme.colors.primary
            }
            style={{ margin: 0, marginLeft: -4 }}
            disabled={disabled}
          />
        </TouchableOpacity>

        {/* Right: Required Toggle */}
        <TouchableOpacity
          onPress={() => !disabled && onUpdate(question.id, { required: !question.required })}
          activeOpacity={0.7}
          disabled={disabled}
          style={[
            styles.requiredToggle,
            {
              backgroundColor: disabled
                ? isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                : question.required
                ? isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
                : isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
              borderColor: question.required ? '#EF4444' : '#10B981',
            },
          ]}
        >
          <Text
            variant="bodySmall"
            style={[
              styles.requiredText,
              {
                color: disabled
                  ? isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
                  : question.required
                  ? '#EF4444'
                  : '#10B981',
              },
            ]}
          >
            {question.required ? 'Required' : 'Optional'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  containerDisabled: {
    // Grayed out effect is handled by individual element colors
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -12,
  },
  questionNumber: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  responseTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  choicesContainer: {
    marginBottom: 12,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  choiceInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
  },
  addChoiceIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addChoiceInput: {
    flex: 1,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  requiredToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  requiredText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
