// app/(tabs)/_layout.tsx
import React, { useState } from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";
import CreateModal from "../event/createModal";
import { Image, StyleSheet } from "react-native";

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
            borderTopColor: colors.outline,
            ...styles.transparentTabBar,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="home" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="tickets"
          options={{
            title: "Tickets",
            tabBarIcon: ({ color, size, focused }) => (
              <Image
                source={TicketIcon}
                style={{
                  width: size,
                  height: size,
                  tintColor: color,
                  opacity: focused ? 1 : 0.7,
                }}
                resizeMode="contain"
              />
            ),
          }}
        />

        {/* ✅ Custom Create Button */}
        <Tabs.Screen
          name="create"
          options={{
            title: "Create",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="plus"
                size={size + 6}
                color={color}
              />
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
          name="clubs"
          options={{
            title: "Clubs",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="account-group"
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="account"
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="create-club"
          options={{
            href: null, // Hide this route from the tab bar
          }}
        />
      </Tabs>

      <CreateModal visible={isModalVisible} onClose={closeModal} />
    </>
  );
}

const styles = StyleSheet.create({
  transparentTabBar: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
});
