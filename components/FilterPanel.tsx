// components/FilterPanel.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Text, useTheme, Divider, RadioButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = width * 0.8;

interface FilterPanelProps {
  visible: boolean;
  onClose: () => void;
  selectedSort: string;
  onSortChange: (sort: string) => void;
  categories: Array<{ id: string; label: string }>;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function FilterPanel({
  visible,
  onClose,
  selectedSort,
  onSortChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: FilterPanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
      ]).start();
    }
  }, [visible]);

  if (!visible && opacity.__getValue() === 0) {
    return null;
  }

  const SORT_OPTIONS = [
    { id: 'featured', label: 'Featured' },
    { id: 'price-low', label: 'Price: Low to High' },
    { id: 'price-high', label: 'Price: High to Low' },
    { id: 'newest', label: 'Newest' },
  ];

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
          tint={theme.dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.panelContent, { backgroundColor: theme.colors.surface + 'F0', paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="headlineSmall" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
              Filters
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.applyButtonSmall, { backgroundColor: theme.colors.primary }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.applyButtonSmallText}>Apply</Text>
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
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            {/* Sort Section */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Sort By
              </Text>
              <RadioButton.Group onValueChange={onSortChange} value={selectedSort}>
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.radioItem}
                    onPress={() => onSortChange(option.id)}
                    activeOpacity={0.7}
                  >
                    <RadioButton.Android value={option.id} color={theme.colors.primary} />
                    <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </View>

            <Divider style={styles.divider} />

            {/* Category Section */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Category
              </Text>
              <RadioButton.Group onValueChange={onCategoryChange} value={selectedCategory}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={styles.radioItem}
                    onPress={() => onCategoryChange(category.id)}
                    activeOpacity={0.7}
                  >
                    <RadioButton.Android value={category.id} color={theme.colors.primary} />
                    <Text style={[styles.radioLabel, { color: theme.colors.onSurface }]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
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
    gap: 12,
  },
  applyButtonSmall: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  applyButtonSmallText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
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
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
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
  divider: {
    marginVertical: 8,
  },
});
