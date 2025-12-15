// app/(tabs)/_layout.tsx
import React, { useState, useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";
import CreateScreen from "../../components/CreateScreen";
import { Image, StyleSheet, Animated, Dimensions, View } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TAB_COUNT = 6; // Home, Events, Store, Clubs, Create, Profile
const TAB_WIDTH = SCREEN_WIDTH / TAB_COUNT;

// Animated tab icon component
const AnimatedTabIcon = ({ name, color, focused, size = 28 }: any) => {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{
      transform: [{ scale: scaleAnim }],
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </Animated.View>
  );
};

// Animated image icon component
const AnimatedImageIcon = ({ source, color, focused }: any) => {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{
      transform: [{ scale: scaleAnim }],
      width: 28,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: color,
          opacity: focused ? 1 : 0.7,
        }}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

export default function TabLayout() {
  const { colors } = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);

  const openModal = () => setIsModalVisible(true);
  const closeModal = () => setIsModalVisible(false);
  const EventIcon = require("../../assets/ticket.png");

  return (
    <>
      <View style={{ position: 'relative', flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.onSurfaceVariant,
            tabBarStyle: {
              backgroundColor: 'transparent',
              borderTopColor: 'transparent',
              borderTopWidth: 0,
              height: 85,
              paddingBottom: 25,
              paddingTop: 10,
              paddingLeft: 0,
              paddingRight: 0,
              position: 'absolute',
            },
            tabBarBackground: () => (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  overflow: 'hidden',
                }}
              >
                {/* making center circle blur */}
                <View
                  style={{
                    position: 'absolute',
                    top: -305,
                    left: 0,
                    width: SCREEN_WIDTH,
                    height: 400,
                  }}
                >
                  <BlurView
                    intensity={50}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: SCREEN_WIDTH,
                      height: 400,
                    }}
                  />
                  <LinearGradient
                    colors={['transparent', 'transparent', '#000000']}
                    locations={[0, 0.3, 1]}
                    style={{ position: 'absolute', width: SCREEN_WIDTH, height: 400 }}
                  />
                </View>
              </View>
            ),
          tabBarItemStyle: {
            width: TAB_WIDTH,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 0,
            marginHorizontal: 0,
            height: '100%',
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            marginTop: 4,
            marginBottom: 0,
            textAlign: 'center',
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="home" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="events"
          options={{
            title: "Events",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="calendar-month" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="store"
          options={{
            title: "Store",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="shopping" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="clubs"
          options={{
            title: "Clubs",
            tabBarIcon: ({ color, focused}) => (
              <AnimatedTabIcon name="account-group" color={color} focused={focused} />
            ),
          }}
        />

        {/* ✅ Custom Create Button */}
        <Tabs.Screen
          name="create"
          options={{
            title: "Create",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="plus" color={color} focused={focused} size={32} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault(); // 🧱 stops navigation
              openModal(); // 🎉 opens bottom modal
            },
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="account" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="create-club"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="create-event"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="event-detail"
          options={{
            href: null,
          }}
        />
      </Tabs>

        {/* shimmer line on top of tab bar */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: 'absolute',
            bottom: 85,
            left: 0,
            right: 0,
            height: 1,
          }}
        />
      </View>

      <CreateScreen visible={isModalVisible} onClose={closeModal} />
    </>
  );
}
