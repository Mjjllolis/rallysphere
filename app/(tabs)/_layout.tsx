// app/(tabs)/_layout.tsx
import React, { useState, useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";
import CreateModal from "../event/createModal";
import { Image, StyleSheet, Animated, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get('window').width;
const TAB_COUNT = 5; // Home, Tickets, Clubs, Create, Profile
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
  const TicketIcon = require("../../assets/ticket.png");

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.outline,
            borderTopWidth: 1,
            height: 85,
            paddingBottom: 15,
            paddingTop: 10,
            paddingLeft: 0,
            paddingRight: 0,
          },
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
          name="tickets"
          options={{
            title: "Tickets",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedImageIcon source={TicketIcon} color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="clubs"
          options={{
            title: "Clubs",
            tabBarIcon: ({ color, focused }) => (
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

      <CreateModal visible={isModalVisible} onClose={closeModal} />
    </>
  );
}
