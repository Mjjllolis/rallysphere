// components/ClubCard.tsx
import React from 'react';
import { View, StyleSheet, Image, ImageBackground } from 'react-native';
import {
  Card,
  Text,
  Button,
  Chip,
  useTheme,
  IconButton
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { Club } from '../lib/firebase';

interface ClubCardProps {
  club: Club;
  isJoined?: boolean;
  onJoin?: (clubId: string) => Promise<void>;
  onLeave?: (clubId: string) => Promise<void>;
  loading?: boolean;
}

export default function ClubCard({
  club,
  isJoined = false,
  onJoin,
  onLeave,
  loading = false
}: ClubCardProps) {
  const theme = useTheme();

  const handlePress = () => {
    router.push(`/club/${club.id}`);
  };

  const handleJoinLeave = async () => {
    if (isJoined && onLeave) {
      await onLeave(club.id);
    } else if (!isJoined && onJoin) {
      await onJoin(club.id);
    }
  };

  return (
    <Card style={styles.card} onPress={handlePress}>
      <ImageBackground
        source={club.coverImage ? { uri: club.coverImage } : undefined}
        style={styles.coverImage}
        imageStyle={styles.backgroundImage}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
          style={styles.gradient}
        >
          <View style={styles.overlayContent}>
            <View style={styles.header}>
              {club.logo && (
                <Image source={{ uri: club.logo }} style={styles.logo} />
              )}
              <View style={styles.titleSection}>
                <Text variant="headlineSmall" style={styles.clubName} numberOfLines={2}>
                  {club.name}
                </Text>
                <Text variant="bodySmall" style={styles.category}>
                  {club.category} • {club.members.length} member{club.members.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {club.tags && club.tags.length > 0 && (
              <View style={styles.tags}>
                {club.tags.slice(0, 3).map((tag) => (
                  <Chip
                    key={tag}
                    compact
                    style={styles.tag}
                    textStyle={styles.tagText}
                  >
                    {tag}
                  </Chip>
                ))}
              </View>
            )}

            {(onJoin || onLeave) && (
              <View style={styles.actions}>
                <Button
                  mode={isJoined ? "outlined" : "contained"}
                  loading={loading}
                  onPress={handleJoinLeave}
                  style={styles.joinButton}
                  buttonColor={isJoined ? 'transparent' : theme.colors.primary}
                  textColor={isJoined ? '#fff' : undefined}
                >
                  {isJoined ? "Joined" : "Join"}
                </Button>
              </View>
            )}
          </View>
        </LinearGradient>
      </ImageBackground>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 10,
    marginHorizontal: 16,
    elevation: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  coverImage: {
    height: 220,
    width: '100%',
  },
  backgroundImage: {
    borderRadius: 16,
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  overlayContent: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  titleSection: {
    flex: 1,
  },
  clubName: {
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  category: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  tagText: {
    color: '#fff',
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  joinButton: {
    flex: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});
