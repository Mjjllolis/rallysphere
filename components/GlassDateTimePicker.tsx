// components/GlassDateTimePicker.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CAROUSEL_HEIGHT = 220;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Date state
  const [selectedMonth, setSelectedMonth] = useState(date.getMonth());
  const [selectedDay, setSelectedDay] = useState(date.getDate());
  const [selectedYear, setSelectedYear] = useState(date.getFullYear());

  // Time state
  const [selectedHour, setSelectedHour] = useState(date.getHours());
  const [selectedMinute, setSelectedMinute] = useState(date.getMinutes());
  const [isPM, setIsPM] = useState(date.getHours() >= 12);

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

  const renderCarousel = (items: any[], selectedValue: any, onSelect: (value: any) => void, format?: (value: any) => string) => {
    const selectedIndex = items.indexOf(selectedValue);

    return (
      <View style={styles.carouselColumn}>
        <View style={styles.carouselWrapper}>
          {items.map((item, index) => {
            const distance = Math.abs(index - selectedIndex);
            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.3;
            const scale = distance === 0 ? 1 : distance === 1 ? 0.85 : 0.7;

            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.carouselItem,
                  distance === 0 && styles.carouselItemSelected,
                ]}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.carouselItemText,
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
        </View>
        {/* Selection indicator */}
        <View style={styles.selectionIndicator} pointerEvents="none" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Collapsed Button */}
      <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.8}>
        <BlurView intensity={40} tint="light" style={styles.buttonBlur}>
          <View style={styles.buttonContent}>
            <View>
              <Text style={styles.labelText}>{label}</Text>
              <Text style={styles.dateText}>
                {date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
            <IconButton
              icon={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              iconColor="white"
            />
          </View>
        </BlurView>
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
          <BlurView intensity={60} tint="dark" style={styles.expandedBlur}>
          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'date' && styles.tabActive]}
              onPress={() => setActiveTab('date')}
            >
              <Text style={[styles.tabText, activeTab === 'date' && styles.tabTextActive]}>
                Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'time' && styles.tabActive]}
              onPress={() => setActiveTab('time')}
            >
              <Text style={[styles.tabText, activeTab === 'time' && styles.tabTextActive]}>
                Time
              </Text>
            </TouchableOpacity>
          </View>

          {/* Carousel Content */}
          <View style={styles.carouselContainer}>
            {activeTab === 'date' ? (
              <>
                {renderCarousel(months, months[selectedMonth], (value) => setSelectedMonth(months.indexOf(value)))}
                {renderCarousel(days, selectedDay, setSelectedDay)}
                {renderCarousel(years, selectedYear, setSelectedYear)}
              </>
            ) : (
              <>
                {renderCarousel(hours, selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour, (value) => setSelectedHour(value))}
                {renderCarousel(minutes, selectedMinute, setSelectedMinute, (val) => val.toString().padStart(2, '0'))}
                <View style={styles.carouselColumn}>
                  <TouchableOpacity
                    style={[styles.amPmButton, !isPM && styles.amPmButtonActive]}
                    onPress={() => setIsPM(false)}
                  >
                    <Text style={[styles.amPmText, !isPM && styles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.amPmButton, isPM && styles.amPmButtonActive]}
                    onPress={() => setIsPM(true)}
                  >
                    <Text style={[styles.amPmText, isPM && styles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Confirm Button */}
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <BlurView intensity={80} tint="light" style={styles.confirmBlur}>
              <Text style={styles.confirmText}>Confirm</Text>
            </BlurView>
          </TouchableOpacity>
          </BlurView>
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  expandedContainer: {
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  expandedBlur: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    padding: 16,
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
  tabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  tabTextActive: {
    color: 'white',
  },
  carouselContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 120,
    marginBottom: 16,
  },
  carouselColumn: {
    flex: 1,
    position: 'relative',
  },
  carouselWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  carouselItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  carouselItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  carouselItemText: {
    color: 'white',
    textAlign: 'center',
  },
  selectionIndicator: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 40,
    marginTop: -20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  amPmButton: {
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  amPmButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  amPmText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  amPmTextActive: {
    color: 'white',
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
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
});
