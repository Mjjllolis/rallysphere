// components/DiscoverFilterPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Text, useTheme, Divider, RadioButton, Checkbox } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeToggle } from '../app/_layout';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = width * 0.8;

export interface DiscoverFilters {
  price: 'all' | 'free' | 'paid';
  dateRange: 'any' | 'today' | 'week' | 'month';
  sortBy: 'soonest' | 'popular' | 'newest';
  showVirtual: boolean;
}

interface DiscoverFilterPanelProps {
  visible: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onFiltersChange: (filters: DiscoverFilters) => void;
  onReset: () => void;
}

export default function DiscoverFilterPanel({
  visible,
  onClose,
  filters,
  onFiltersChange,
  onReset,
}: DiscoverFilterPanelProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const accent = isDark ? '#8B5CF6' : '#A78BFA';
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: PANEL_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible]);

  if (!shouldRender) {
    return null;
  }

  const PRICE_OPTIONS = [
    { id: 'all', label: 'All Events' },
    { id: 'free', label: 'Free Only' },
    { id: 'paid', label: 'Paid Only' },
  ];

  const DATE_OPTIONS = [
    { id: 'any', label: 'Any Time' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
  ];

  const SORT_OPTIONS = [
    { id: 'soonest', label: 'Happening Soon' },
    { id: 'popular', label: 'Most Popular' },
    { id: 'newest', label: 'Recently Added' },
  ];

  const updateFilter = <K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.price !== 'all' ||
    filters.dateRange !== 'any' ||
    filters.sortBy !== 'soonest' ||
    filters.showVirtual;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        </TouchableOpacity>
      </Animated.View>

      {/* Filter Panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            width: PANEL_WIDTH,
            transform: [{ translateX }],
          },
        ]}
      >
        <BlurView
          intensity={100}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.panelContent, { backgroundColor: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)', paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="headlineSmall" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
              Filters
            </Text>
            <View style={styles.headerActions}>
              {hasActiveFilters && (
                <TouchableOpacity
                  style={[styles.resetButton, { borderColor: theme.colors.outline }]}
                  onPress={onReset}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resetButtonText, { color: theme.colors.onSurfaceVariant }]}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: accent }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={28} color={theme.colors.onSurface} />
              </TouchableOpacity>
            </View>
          </View>

          <Divider />

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
          >
            {/* Sort Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="swap-vertical" size={18} color={accent} />
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Sort By
                </Text>
              </View>
              <RadioButton.Group
                onValueChange={(value) => updateFilter('sortBy', value as DiscoverFilters['sortBy'])}
                value={filters.sortBy}
              >
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.radioItem}
                    onPress={() => updateFilter('sortBy', option.id as DiscoverFilters['sortBy'])}
                    activeOpacity={0.7}
                  >
                    <RadioButton.Android value={option.id} color={accent} />
                    <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </View>

            <Divider style={styles.divider} />

            {/* Price Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetag" size={18} color={accent} />
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Price
                </Text>
              </View>
              <RadioButton.Group
                onValueChange={(value) => updateFilter('price', value as DiscoverFilters['price'])}
                value={filters.price}
              >
                {PRICE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.radioItem}
                    onPress={() => updateFilter('price', option.id as DiscoverFilters['price'])}
                    activeOpacity={0.7}
                  >
                    <RadioButton.Android value={option.id} color={accent} />
                    <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </View>

            <Divider style={styles.divider} />

            {/* Date Range Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar" size={18} color={accent} />
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Date
                </Text>
              </View>
              <RadioButton.Group
                onValueChange={(value) => updateFilter('dateRange', value as DiscoverFilters['dateRange'])}
                value={filters.dateRange}
              >
                {DATE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.radioItem}
                    onPress={() => updateFilter('dateRange', option.id as DiscoverFilters['dateRange'])}
                    activeOpacity={0.7}
                  >
                    <RadioButton.Android value={option.id} color={accent} />
                    <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </View>

            <Divider style={styles.divider} />

            {/* Additional Options */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="options" size={18} color={accent} />
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Options
                </Text>
              </View>
              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => updateFilter('showVirtual', !filters.showVirtual)}
                activeOpacity={0.7}
              >
                <Checkbox.Android
                  status={filters.showVirtual ? 'checked' : 'unchecked'}
                  onPress={() => updateFilter('showVirtual', !filters.showVirtual)}
                  color={accent}
                />
                <View style={styles.checkboxContent}>
                  <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                    Virtual Events Only
                  </Text>
                  <Text style={[styles.checkboxDescription, { color: theme.colors.onSurfaceVariant }]}>
                    Show only online/virtual events
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
  },
  panelContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  applyButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioLabel: {
    fontSize: 15,
    marginLeft: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  checkboxContent: {
    flex: 1,
    marginLeft: 8,
    paddingTop: 2,
  },
  checkboxDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    marginVertical: 4,
  },
});
