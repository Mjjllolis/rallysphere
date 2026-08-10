// components/LocationAutocompleteInput.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { createSessionToken, fetchPlacePredictions, fetchPlaceLocation } from '../lib/googlePlaces';
import { useThemeToggle } from '../app/_layout';

export interface SelectedLocation {
  description: string;
  latitude: number;
  longitude: number;
}

interface Prediction {
  place_id: string;
  description: string;
}

const DROPDOWN_ROW_HEIGHT = 44;
const VISIBLE_ROWS = 3;

interface LocationAutocompleteInputProps {
  value: SelectedLocation | null;
  onSelect: (location: SelectedLocation | null) => void;
  accentColor: string;
  /** 'compact' = small pill field (used in the Discover filter drawer). 'glass' = full-width form field matching GlassInput. */
  variant?: 'compact' | 'glass';
  /** Label shown above the field in 'glass' variant. */
  label?: string;
  placeholder?: string;
  /** Restrict suggestions to specific Google Places primary types, e.g. ['locality'] for cities-only. Omit for full addresses/venues. */
  includedPrimaryTypes?: string[];
  error?: string;
  onFocus?: () => void;
}

export default function LocationAutocompleteInput({
  value,
  onSelect,
  accentColor,
  variant = 'compact',
  label,
  placeholder,
  includedPrimaryTypes,
  error,
  onFocus,
}: LocationAutocompleteInputProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One token per search session (start typing -> pick a result or clear). Google bills
  // an Autocomplete session + its Place Details call as one unit only when they share
  // a token; without it every keystroke is billed as a separate request.
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const input = query.trim();
    if (input.length < 3) {
      setPredictions([]);
      setSearched(false);
      setErrorMessage(null);
      return;
    }
    debounceRef.current = setTimeout(() => fetchPredictions(input), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const fetchPredictions = async (input: string) => {
    if (!sessionTokenRef.current) sessionTokenRef.current = createSessionToken();
    try {
      setLoading(true);
      setErrorMessage(null);
      const results = await fetchPlacePredictions(input, sessionTokenRef.current, includedPrimaryTypes);
      setPredictions(results.map((r) => ({ place_id: r.placeId, description: r.description })));
    } catch (e: any) {
      setPredictions([]);
      setErrorMessage(e?.message === 'Missing Google API key' ? e.message : 'Location search failed — check your connection');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleSelect = async (prediction: Prediction) => {
    setPredictions([]);
    setQuery('');
    setResolving(true);
    const token = sessionTokenRef.current ?? createSessionToken();
    const coords = await fetchPlaceLocation(prediction.place_id, token).catch(() => null);
    // Selecting a place ends the session; the next search starts a fresh token.
    sessionTokenRef.current = null;
    setResolving(false);
    if (coords) {
      onSelect({
        description: prediction.description,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }
  };

  const clear = () => {
    onSelect(null);
    setQuery('');
    setPredictions([]);
    setSearched(false);
    setErrorMessage(null);
    sessionTokenRef.current = null;
  };

  const showMenu = query.trim().length >= 3 && (loading || searched);

  const dropdown = showMenu && (
    <View
      style={[
        styles.dropdown,
        { backgroundColor: theme.colors.elevation.level3, borderColor: theme.colors.outline },
      ]}
    >
      {loading ? (
        <View style={[styles.dropdownItem, { minHeight: DROPDOWN_ROW_HEIGHT }]}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={[styles.dropdownItemText, { color: theme.colors.onSurfaceVariant }]}>
            Searching…
          </Text>
        </View>
      ) : predictions.length > 0 ? (
        <ScrollView
          style={{ maxHeight: DROPDOWN_ROW_HEIGHT * Math.min(VISIBLE_ROWS, predictions.length) }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={predictions.length > VISIBLE_ROWS}
        >
          {predictions.map((p, i) => (
            <TouchableOpacity
              key={p.place_id}
              style={[
                styles.dropdownItem,
                { height: DROPDOWN_ROW_HEIGHT },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant },
              ]}
              onPress={() => handleSelect(p)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={14} color={theme.colors.onSurfaceVariant} />
              <Text
                style={[styles.dropdownItemText, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {p.description}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.dropdownItem, { minHeight: DROPDOWN_ROW_HEIGHT }]}>
          <Ionicons
            name={errorMessage ? 'alert-circle-outline' : 'search-outline'}
            size={14}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            style={[styles.dropdownItemText, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={2}
          >
            {errorMessage || 'No matching places found'}
          </Text>
        </View>
      )}
    </View>
  );

  if (variant === 'glass') {
    return (
      <View style={styles.glassContainer}>
        {label && <Text style={[styles.glassLabel, { color: theme.colors.onSurface }]}>{label}</Text>}
        <View style={styles.glassWrapper}>
          {isDark ? (
            <BlurView intensity={40} tint="light" style={[styles.glassBlur, { borderColor: theme.colors.outline }]}>
              <GlassFieldContent
                value={value}
                query={query}
                setQuery={setQuery}
                clear={clear}
                loading={loading}
                resolving={resolving}
                placeholder={placeholder}
                theme={theme}
                onFocus={onFocus}
              />
            </BlurView>
          ) : (
            <View style={[styles.glassBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
              <GlassFieldContent
                value={value}
                query={query}
                setQuery={setQuery}
                clear={clear}
                loading={loading}
                resolving={resolving}
                placeholder={placeholder}
                theme={theme}
                onFocus={onFocus}
              />
            </View>
          )}
        </View>
        {dropdown}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }

  if (value) {
    return (
      <View
        style={[
          styles.lockedChip,
          { borderColor: accentColor, backgroundColor: `${accentColor}22` },
        ]}
      >
        <Ionicons name="location" size={16} color={accentColor} />
        <Text
          style={[styles.lockedChipText, { color: theme.colors.onSurface }]}
          numberOfLines={1}
        >
          {value.description}
        </Text>
        <TouchableOpacity onPress={clear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.inputWrapper, { borderColor: theme.colors.outline }]}>
        <Ionicons name="search-outline" size={16} color={theme.colors.onSurfaceVariant} />
        <TextInput
          placeholder={placeholder || 'e.g. Houston, TX'}
          placeholderTextColor={theme.colors.onSurfaceDisabled}
          value={query}
          onChangeText={setQuery}
          onFocus={onFocus}
          style={[styles.input, { color: theme.colors.onSurface }]}
        />
        {(loading || resolving) && <ActivityIndicator size="small" color={accentColor} />}
      </View>
      {dropdown}
    </View>
  );
}

function GlassFieldContent({
  value,
  query,
  setQuery,
  clear,
  loading,
  resolving,
  placeholder,
  theme,
  onFocus,
}: {
  value: SelectedLocation | null;
  query: string;
  setQuery: (v: string) => void;
  clear: () => void;
  loading: boolean;
  resolving: boolean;
  placeholder?: string;
  theme: any;
  onFocus?: () => void;
}) {
  return (
    <View style={styles.glassInputContainer}>
      <View style={styles.glassIconContainer}>
        <Ionicons name="location-outline" size={20} color={theme.colors.onSurface} />
      </View>
      {value ? (
        <>
          <Text
            style={[styles.glassInput, styles.glassValueText, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {value.description}
          </Text>
          <TouchableOpacity onPress={clear} hitSlop={8} style={styles.glassClearButton}>
            <Ionicons name="close-circle" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            placeholder={placeholder || 'Search for an address or venue'}
            placeholderTextColor={theme.colors.onSurfaceDisabled}
            value={query}
            onChangeText={setQuery}
            onFocus={onFocus}
            style={[styles.glassInput, { color: theme.colors.onSurface }]}
          />
          {(loading || resolving) && <ActivityIndicator size="small" color={theme.colors.onSurface} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  input: { flex: 1, fontSize: 14, padding: 0, margin: 0 },
  dropdown: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownItemText: { fontSize: 13, flex: 1 },
  lockedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lockedChipText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Glass variant (matches GlassInput)
  glassContainer: { marginBottom: 16 },
  glassLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  glassWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  glassBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  glassInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  glassIconContainer: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    paddingRight: 16,
    minHeight: 52,
  },
  glassValueText: {
    paddingTop: 16,
  },
  glassClearButton: {
    paddingHorizontal: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 4,
  },
});
