import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function TicketsScreen() {
  const [activeTab, setActiveTab] = useState('Tickets');

  const tabs = ['Tickets', 'Saved', 'Memberships', 'Classpacks'];

  return (
    <View style={styles.container}>
      {/* 🔹 Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Purchases</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={24} color="#222" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <MaterialCommunityIcons name="message-outline" size={24} color="#222" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              activeOpacity={0.8}
            >
              <Text
                allowFontScaling={false}
                style={[styles.tabText, activeTab === tab && styles.activeTabText]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        <Text style={styles.contentText}>
          {activeTab} content will appear here.
        </Text>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  /* 🔹 Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  iconButton: {
    padding: 6,
  },

  tabsWrapper: {
    height: 48, // controls overall bar height
    paddingHorizontal: 12,
  },
  tabsRow: {
    alignItems: 'center',
  },
  tab: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#f4f4f4',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#222',
  },
  tabText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#555',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },

  /* 🔹 Content */
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentText: {
    fontSize: 16,
    color: '#555',
  },
});
