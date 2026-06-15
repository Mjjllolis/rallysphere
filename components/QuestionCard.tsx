import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Text, IconButton, useTheme, Menu } from 'react-native-paper';
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
}: QuestionCardProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [menuVisible, setMenuVisible] = useState(false);
  const [requiredMenuVisible, setRequiredMenuVisible] = useState(false);
  const [publicMenuVisible, setPublicMenuVisible] = useState(false);

  const canMoveUp = index > 0;
  const canMoveDown = index < totalQuestions - 1;

  const handleTextChange = (text: string) => {
    onUpdate(question.id, { text });
  };

  const handleDelete = () => {
    setMenuVisible(false);
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

  const handleMoveUp = () => {
    setMenuVisible(false);
    onMoveUp(question.id);
  };

  const handleMoveDown = () => {
    setMenuVisible(false);
    onMoveDown(question.id);
  };

  return (
    <View style={[styles.container, disabled && styles.containerDisabled]}>
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
        <Menu
          visible={!disabled && menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              size={20}
              iconColor={disabled
                ? isDark
                  ? 'rgba(255,255,255,0.2)'
                  : 'rgba(0,0,0,0.2)'
                : theme.colors.onSurfaceVariant
              }
              onPress={() => !disabled && setMenuVisible(true)}
              style={{ margin: 0 }}
              disabled={disabled}
            />
          }
          anchorPosition="bottom"
        >
          <Menu.Item
            leadingIcon="arrow-up"
            title="Move Up"
            disabled={!canMoveUp}
            onPress={handleMoveUp}
          />
          <Menu.Item
            leadingIcon="arrow-down"
            title="Move Down"
            disabled={!canMoveDown}
            onPress={handleMoveDown}
          />
          <Menu.Item
            leadingIcon="delete"
            title="Delete"
            titleStyle={{ color: '#EF4444' }}
            onPress={handleDelete}
          />
        </Menu>
      </View>

      {/* Question Text Input */}
      <TextInput
        value={question.text}
        onChangeText={handleTextChange}
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

        {/* Right: Required and Public */}
        <View style={styles.rightOptions}>
          {/* Required */}
          <Menu
            visible={!disabled && requiredMenuVisible}
            onDismiss={() => setRequiredMenuVisible(false)}
            anchor={
              <TouchableOpacity
                onPress={() => !disabled && setRequiredMenuVisible(true)}
                activeOpacity={0.7}
                disabled={disabled}
                style={styles.optionButton}
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
                        : theme.colors.onSurfaceVariant,
                    },
                  ]}
                >
                  {question.required ? 'Required' : 'Optional'}
                </Text>
                <IconButton
                  icon="chevron-down"
                  size={16}
                  iconColor={disabled
                    ? isDark
                      ? 'rgba(255,255,255,0.3)'
                      : 'rgba(0,0,0,0.3)'
                    : theme.colors.onSurfaceVariant
                  }
                  style={{ margin: 0, marginLeft: -4 }}
                  disabled={disabled}
                />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              title="Required"
              onPress={() => {
                onUpdate(question.id, { required: true });
                setRequiredMenuVisible(false);
              }}
              leadingIcon={question.required ? 'check' : undefined}
            />
            <Menu.Item
              title="Optional"
              onPress={() => {
                onUpdate(question.id, { required: false });
                setRequiredMenuVisible(false);
              }}
              leadingIcon={!question.required ? 'check' : undefined}
            />
          </Menu>

          {/* Public/Private */}
          <Menu
            visible={!disabled && publicMenuVisible}
            onDismiss={() => setPublicMenuVisible(false)}
            anchor={
              <TouchableOpacity
                onPress={() => !disabled && setPublicMenuVisible(true)}
                activeOpacity={0.7}
                disabled={disabled}
                style={styles.optionButton}
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
                        : theme.colors.onSurfaceVariant,
                    },
                  ]}
                >
                  {question.isPublic ? 'Public' : 'Private'}
                </Text>
                <IconButton
                  icon="chevron-down"
                  size={16}
                  iconColor={disabled
                    ? isDark
                      ? 'rgba(255,255,255,0.3)'
                      : 'rgba(0,0,0,0.3)'
                    : theme.colors.onSurfaceVariant
                  }
                  style={{ margin: 0, marginLeft: -4 }}
                  disabled={disabled}
                />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              title="Public"
              onPress={() => {
                onUpdate(question.id, { isPublic: true });
                setPublicMenuVisible(false);
              }}
              leadingIcon={question.isPublic ? 'check' : undefined}
            />
            <Menu.Item
              title="Private"
              onPress={() => {
                onUpdate(question.id, { isPublic: false });
                setPublicMenuVisible(false);
              }}
              leadingIcon={!question.isPublic ? 'check' : undefined}
            />
          </Menu>
        </View>
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
  rightOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
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
});
