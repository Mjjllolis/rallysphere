// components/GlassDateTimePicker.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CAROUSEL_HEIGHT = 340;
const ITEM_HEIGHT = 44;

interface GlassDateTimePickerProps {
  label: string;
  date: Date;
  onDateChange: (date: Date) => void;
  minimumDate?: Date;
}

export default function GlassDateTimePicker({
  label,
  date,
  onDateChange,
  minimumDate,
}: GlassDateTimePickerProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // ScrollView refs for each carousel column
  const monthScrollRef = useRef<ScrollView>(null);
  const dayScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  // Date state
  const [selectedMonth, setSelectedMonth] = useState(date.getMonth());
  const [selectedDay, setSelectedDay] = useState(date.getDate());
  const [selectedYear, setSelectedYear] = useState(date.getFullYear());

  // Time state
  const [selectedHour, setSelectedHour] = useState(date.getHours());
  const [selectedMinute, setSelectedMinute] = useState(date.getMinutes());
  const [isPM, setIsPM] = useState(date.getHours() >= 12);

  // Scroll to selected items when picker opens
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => {
        if (activeTab === 'date') {
          monthScrollRef.current?.scrollTo({ y: selectedMonth * ITEM_HEIGHT, animated: false });
          dayScrollRef.current?.scrollTo({ y: (selectedDay - 1) * ITEM_HEIGHT, animated: false });
          const yearIndex = years.indexOf(selectedYear);
          yearScrollRef.current?.scrollTo({ y: yearIndex * ITEM_HEIGHT, animated: false });
        } else {
          const displayHour = selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour;
          hourScrollRef.current?.scrollTo({ y: (displayHour - 1) * ITEM_HEIGHT, animated: false });
          minuteScrollRef.current?.scrollTo({ y: selectedMinute * ITEM_HEIGHT, animated: false });
        }
      }, 100);
    }
  }, [isExpanded, activeTab]);

  useEffect(() => {
    if (isExpanded) {
      Animated.parallel([
        Animated.spring(heightAnim, {
          toValue: CAROUSEL_HEIGHT,
          tension: 50,
          friction: 8,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(heightAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleConfirm = () => {
    const newDate = new Date(date);
    newDate.setFullYear(selectedYear);
    newDate.setMonth(selectedMonth);
    newDate.setDate(selectedDay);

    const hours24 = isPM ? (selectedHour === 12 ? 12 : selectedHour + 12) : (selectedHour === 12 ? 0 : selectedHour);
    newDate.setHours(hours24);
    newDate.setMinutes(selectedMinute);

    onDateChange(newDate);
    setIsExpanded(false);
  };

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const days = Array.from({ length: getDaysInMonth(selectedMonth, selectedYear) }, (_, i) => i + 1);
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const renderCarousel = (
    items: any[],
    selectedValue: any,
    onSelect: (value: any) => void,
    scrollViewRef: React.RefObject<ScrollView>,
    format?: (value: any) => string
  ) => {
    const selectedIndex = items.indexOf(selectedValue);

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const index = Math.round(offsetY / ITEM_HEIGHT);
      if (index >= 0 && index < items.length && items[index] !== selectedValue) {
        onSelect(items[index]);
      }
    };

    const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const index = Math.round(offsetY / ITEM_HEIGHT);
      if (scrollViewRef.current && index >= 0 && index < items.length) {
        scrollViewRef.current.scrollTo({
          y: index * ITEM_HEIGHT,
          animated: true,
        });
      }
    };

    return (
      <View style={styles.carouselColumn}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.carouselWrapper}
          contentContainerStyle={styles.carouselContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onScroll={handleScroll}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
        >
          {items.map((item, index) => {
            const distance = Math.abs(index - selectedIndex);
            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.3;
            const scale = distance === 0 ? 1 : distance === 1 ? 0.85 : 0.7;

            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.carouselItem,
                  distance === 0 && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)', borderRadius: 8 },
                ]}
                onPress={() => {
                  const itemIndex = items.indexOf(item);
                  onSelect(item);
                  if (scrollViewRef.current) {
                    scrollViewRef.current.scrollTo({
                      y: itemIndex * ITEM_HEIGHT,
                      animated: true,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.carouselItemText,
                    { color: theme.colors.onSurface },
                    {
                      opacity,
                      fontSize: 18 * scale,
                      fontWeight: distance === 0 ? '700' : '500',
                    },
                  ]}
                >
                  {format ? format(item) : item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {/* Selection indicator */}
        <View style={[styles.selectionIndicator, { borderColor: theme.colors.outline }]} pointerEvents="none" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Collapsed Button */}
      <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.8}>
        {isDark ? (
          <BlurView intensity={40} tint="light" style={[styles.buttonBlur, { borderColor: theme.colors.outline }]}>
            <View style={styles.buttonContent}>
              <View>
                <Text style={[styles.labelText, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
                <Text style={[styles.dateText, { color: theme.colors.onSurface }]}>
                  {date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <IconButton icon={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} iconColor={theme.colors.onSurface} />
            </View>
          </BlurView>
        ) : (
          <View style={[styles.buttonBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.buttonContent}>
              <View>
                <Text style={[styles.labelText, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
                <Text style={[styles.dateText, { color: theme.colors.onSurface }]}>
                  {date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <IconButton icon={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} iconColor={theme.colors.onSurface} />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Expanded Carousel - Smooth Height Animation */}
      <Animated.View
        style={[
          styles.expandedContainer,
          {
            height: heightAnim,
            opacity: opacityAnim,
          },
        ]}
        pointerEvents={isExpanded ? 'auto' : 'none'}
      >
        {isExpanded && (
          isDark ? (
          <BlurView intensity={60} tint="dark" style={[styles.expandedBlur, { borderColor: theme.colors.outline }]}>
            {/* Tab Switcher */}
            <View style={[styles.tabContainer, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
              <TouchableOpacity style={[styles.tab, activeTab === 'date' && { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} onPress={() => setActiveTab('date')}>
                <Text style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'date' && { color: theme.colors.onSurface }]}>Date</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'time' && { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} onPress={() => setActiveTab('time')}>
                <Text style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'time' && { color: theme.colors.onSurface }]}>Time</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.carouselContainer}>
              {activeTab === 'date' ? (
                <>
                  {renderCarousel(months, months[selectedMonth], (value) => setSelectedMonth(months.indexOf(value)), monthScrollRef)}
                  {renderCarousel(days, selectedDay, setSelectedDay, dayScrollRef)}
                  {renderCarousel(years, selectedYear, setSelectedYear, yearScrollRef)}
                </>
              ) : (
                <>
                  {renderCarousel(hours, selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour, (value) => setSelectedHour(value), hourScrollRef)}
                  {renderCarousel(minutes, selectedMinute, setSelectedMinute, minuteScrollRef, (val) => val.toString().padStart(2, '0'))}
                  <View style={styles.carouselColumn}>
                    <TouchableOpacity style={[styles.amPmButton, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }, !isPM && { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]} onPress={() => setIsPM(false)}>
                      <Text style={[styles.amPmText, { color: theme.colors.onSurfaceVariant }, !isPM && { color: theme.colors.onSurface }]}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.amPmButton, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }, isPM && { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]} onPress={() => setIsPM(true)}>
                      <Text style={[styles.amPmText, { color: theme.colors.onSurfaceVariant }, isPM && { color: theme.colors.onSurface }]}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <BlurView intensity={80} tint="light" style={[styles.confirmBlur, { borderColor: theme.colors.outline }]}>
                <Text style={[styles.confirmText, { color: theme.colors.onSurface }]}>Confirm</Text>
              </BlurView>
            </TouchableOpacity>
          </BlurView>
          ) : (
          <View style={[styles.expandedBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
            {/* Tab Switcher */}
            <View style={[styles.tabContainer, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }]}>
              <TouchableOpacity style={[styles.tab, activeTab === 'date' && { backgroundColor: theme.colors.primary }]} onPress={() => setActiveTab('date')}>
                <Text style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'date' && { color: theme.colors.onPrimary }]}>Date</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'time' && { backgroundColor: theme.colors.primary }]} onPress={() => setActiveTab('time')}>
                <Text style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'time' && { color: theme.colors.onPrimary }]}>Time</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.carouselContainer}>
              {activeTab === 'date' ? (
                <>
                  {renderCarousel(months, months[selectedMonth], (value) => setSelectedMonth(months.indexOf(value)), monthScrollRef)}
                  {renderCarousel(days, selectedDay, setSelectedDay, dayScrollRef)}
                  {renderCarousel(years, selectedYear, setSelectedYear, yearScrollRef)}
                </>
              ) : (
                <>
                  {renderCarousel(hours, selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour, (value) => setSelectedHour(value), hourScrollRef)}
                  {renderCarousel(minutes, selectedMinute, setSelectedMinute, minuteScrollRef, (val) => val.toString().padStart(2, '0'))}
                  <View style={styles.carouselColumn}>
                    <TouchableOpacity style={[styles.amPmButton, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }, !isPM && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }]} onPress={() => setIsPM(false)}>
                      <Text style={[styles.amPmText, { color: theme.colors.onSurfaceVariant }, !isPM && { color: theme.colors.onSurface }]}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.amPmButton, { backgroundColor: 'rgba(0, 0, 0, 0.05)' }, isPM && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }]} onPress={() => setIsPM(true)}>
                      <Text style={[styles.amPmText, { color: theme.colors.onSurfaceVariant }, isPM && { color: theme.colors.onSurface }]}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <View style={[styles.confirmBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.primary }]}>
                <Text style={[styles.confirmText, { color: theme.colors.onPrimary }]}>Confirm</Text>
              </View>
            </TouchableOpacity>
          </View>
          )
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  buttonBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 12,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
  },
  expandedContainer: {
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  expandedBlur: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  carouselContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 180,
    marginBottom: 16,
  },
  carouselColumn: {
    flex: 1,
    position: 'relative',
  },
  carouselWrapper: {
    flex: 1,
  },
  carouselContent: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  carouselItem: {
    height: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselItemText: {
    textAlign: 'center',
  },
  selectionIndicator: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    marginTop: -(ITEM_HEIGHT / 2) - 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  amPmButton: {
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  amPmText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmBlur: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
