// components/GlassMemoryCard.tsx
import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2; // 2 columns with padding

interface GlassMemoryCardProps {
  imageUri?: string;
  title: string;
  eventName?: string;
  date?: Date;
  likes?: number;
  comments?: number;
  onPress?: () => void;
  onLike?: () => void;
  isLiked?: boolean;
}

export default function GlassMemoryCard({
  imageUri,
  title,
  eventName,
  date,
  likes = 0,
  comments = 0,
  onPress,
  onLike,
  isLiked = false,
}: GlassMemoryCardProps) {
  const formatDate = (date?: Date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Image Container */}
      <View style={styles.imageContainer}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={styles.image} />
            {/* Gradient Overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(0, 0, 0, 0.8)']}
              style={styles.gradient}
            />
          </>
        ) : (
          <View style={styles.placeholderContainer}>
            <BlurView intensity={40} tint="dark" style={styles.placeholder}>
              <Text style={styles.placeholderText}>📸</Text>
            </BlurView>
          </View>
        )}

        {/* Content Overlay */}
        <View style={styles.contentOverlay}>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {eventName && (
              <Text style={styles.eventName} numberOfLines={1}>
                {eventName}
              </Text>
            )}
            {date && (
              <Text style={styles.date}>{formatDate(date)}</Text>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={onLike}
              activeOpacity={0.7}
            >
              <Text style={styles.statIcon}>{isLiked ? '❤️' : '🤍'}</Text>
              {likes > 0 && (
                <Text style={styles.statText}>{likes}</Text>
              )}
            </TouchableOpacity>

            {comments > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>💬</Text>
                <Text style={styles.statText}>{comments}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    marginBottom: 16,
  },
  imageContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.3, // 1:1.3 aspect ratio
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  placeholderContainer: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  placeholderText: {
    fontSize: 40,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  textContainer: {
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
    lineHeight: 18,
  },
  eventName: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 2,
  },
  date: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
});
