// components/ClubCard.tsx
import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { 
  Card, 
  Text, 
  Button, 
  Chip,
  useTheme,
  IconButton
} from 'react-native-paper';
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
      {club.coverImage && (
        <Card.Cover source={{ uri: club.coverImage }} style={styles.coverImage} />
      )}
      
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleSection}>
            {club.logo && (
              <Image source={{ uri: club.logo }} style={styles.logo} />
            )}
            <View style={styles.titleText}>
              <Text variant="titleMedium" style={styles.clubName} numberOfLines={1}>
                {club.name}
              </Text>
              <Text variant="bodySmall" style={[styles.category, { color: theme.colors.primary }]}>
                {club.category}
              </Text>
            </View>
          </View>
          
          {(onJoin || onLeave) && (
            <Button
              mode={isJoined ? "outlined" : "contained"}
              compact
              loading={loading}
              onPress={handleJoinLeave}
              style={styles.joinButton}
            >
              {isJoined ? "Leave" : "Join"}
            </Button>
          )}
        </View>

        <Text variant="bodyMedium" style={styles.description} numberOfLines={2}>
          {club.description}
        </Text>

        <View style={styles.footer}>
          <View style={styles.info}>
            {club.location && (
              <View style={styles.infoItem}>
                <Text variant="bodySmall" style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
                  📍 {club.location}
                </Text>
              </View>
            )}
            {club.university && (
              <View style={styles.infoItem}>
                <Text variant="bodySmall" style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
                  🏫 {club.university}
                </Text>
              </View>
            )}
          </View>

          <Text variant="bodySmall" style={[styles.memberCount, { color: theme.colors.onSurfaceVariant }]}>
            {club.members.length} member{club.members.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {club.tags && club.tags.length > 0 && (
          <View style={styles.tags}>
            {club.tags.slice(0, 3).map((tag) => (
              <Chip key={tag} compact style={styles.tag}>
                {tag}
              </Chip>
            ))}
            {club.tags.length > 3 && (
              <Text variant="bodySmall" style={[styles.moreTags, { color: theme.colors.onSurfaceVariant }]}>
                +{club.tags.length - 3} more
              </Text>
            )}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
  },
  coverImage: {
    height: 120,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  titleText: {
    flex: 1,
  },
  clubName: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  category: {
    fontWeight: '500',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  joinButton: {
    alignSelf: 'flex-start',
  },
  description: {
    marginBottom: 12,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  info: {
    flex: 1,
  },
  infoItem: {
    marginBottom: 2,
  },
  infoText: {
    fontSize: 12,
  },
  memberCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tag: {
    marginRight: 6,
    marginBottom: 4,
  },
  moreTags: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
