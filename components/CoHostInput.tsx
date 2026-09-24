// components/CoHostInput.tsx
import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeToggle } from '../app/_layout';
import { getClubs, type Club } from '../lib/firebase';

const MAX_RESULTS = 5;

interface CoHostInputProps {
  label: string;
  helperText?: string;
  selectedClubs: Club[];
  onSelectedClubsChange: (clubs: Club[]) => void;
  excludeClubIds?: string[];
  placeholder?: string;
  onFocus?: () => void;
}

export default function CoHostInput({
  label,
  helperText,
  selectedClubs,
  onSelectedClubsChange,
  excludeClubIds = [],
  placeholder = 'Search clubs to add as co-hosts...',
  onFocus,
}: CoHostInputProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getClubs().then((result) => {
      if (result.success) setAllClubs(result.clubs);
    });
  }, []);

  const addClub = (club: Club) => {
    onSelectedClubsChange([...selectedClubs, club]);
    setQuery('');
  };

  const removeClub = (clubId: string) => {
    onSelectedClubsChange(selectedClubs.filter((c) => c.id !== clubId));
  };

  const trimmedQuery = query.trim().toLowerCase();
  const excludedIds = new Set([...excludeClubIds, ...selectedClubs.map((c) => c.id)]);
  const results = trimmedQuery
    ? allClubs
        .filter(
          (club) =>
            !excludedIds.has(club.id) &&
            (club.name.toLowerCase().includes(trimmedQuery) ||
              club.description.toLowerCase().includes(trimmedQuery) ||
              club.category.toLowerCase().includes(trimmedQuery) ||
              (club.tags && club.tags.some((tag) => tag.toLowerCase().includes(trimmedQuery))))
        )
        .slice(0, MAX_RESULTS)
    : [];

  const clubImage = (club: Club, style: object) =>
    club.logo || club.coverImage ? (
      <ExpoImage source={{ uri: club.logo || club.coverImage }} style={style} />
    ) : (
      <View style={[style, styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Ionicons name="people" size={12} color={theme.colors.onSurfaceVariant} />
      </View>
    );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>
      {helperText && (
        <Text style={[styles.helperText, { color: theme.colors.onSurfaceVariant }]}>{helperText}</Text>
      )}

      {/* Selected co-host chips */}
      {selectedClubs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScrollView}
          contentContainerStyle={styles.chipsContainer}
        >
          {selectedClubs.map((club) =>
            isDark ? (
              <BlurView key={club.id} intensity={40} tint="light" style={[styles.chipBlur, { borderColor: theme.colors.outline }]}>
                <View style={styles.chip}>
                  {clubImage(club, styles.chipImage)}
                  <Text style={[styles.chipText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeClub(club.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconButton icon="close-circle" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.removeIcon} />
                  </TouchableOpacity>
                </View>
              </BlurView>
            ) : (
              <View key={club.id} style={[styles.chipBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
                <View style={styles.chip}>
                  {clubImage(club, styles.chipImage)}
                  <Text style={[styles.chipText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeClub(club.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconButton icon="close-circle" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.removeIcon} />
                  </TouchableOpacity>
                </View>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* Search input */}
      {isDark ? (
        <BlurView intensity={40} tint="light" style={[styles.inputBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.inputContainer}>
            <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={onFocus}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.onSurfaceDisabled}
              style={[styles.input, { color: theme.colors.onSurface }]}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        </BlurView>
      ) : (
        <View style={[styles.inputBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.inputContainer}>
            <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={onFocus}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.onSurfaceDisabled}
              style={[styles.input, { color: theme.colors.onSurface }]}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        </View>
      )}

      {/* Search results dropdown */}
      {results.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: theme.colors.elevation.level3, borderColor: theme.colors.outline }]}>
          {results.map((club, i) => (
            <TouchableOpacity
              key={club.id}
              style={[
                styles.dropdownItem,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant },
              ]}
              onPress={() => addClub(club)}
              activeOpacity={0.7}
            >
              {clubImage(club, styles.dropdownImage)}
              <Text style={[styles.dropdownItemText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {club.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  helperText: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
    marginLeft: 4,
  },
  chipsScrollView: {
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chipBlur: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 180,
  },
  chipImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  removeIcon: {
    margin: 0,
    padding: 0,
  },
  inputBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 52,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dropdownItemText: {
    fontSize: 14,
    flex: 1,
  },
});
