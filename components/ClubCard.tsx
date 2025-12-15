// components/ClubCard.tsx
import React from 'react';
import { View, StyleSheet, Image, ImageBackground, TouchableOpacity } from 'react-native';
import {
  Text,
  useTheme,
  IconButton,
  ActivityIndicator
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import type { Club } from '../lib/firebase';

interface ClubCardProps {
  club: Club;
  isJoined?: boolean;
  onJoin?: (clubId: string) => Promise<void>;
  onLeave?: (clubId: string) => Promise<void>;
  loading?: boolean;
  compact?: boolean;
}

export default function ClubCard({
  club,
  isJoined = false,
  onJoin,
  onLeave,
  loading = false,
  compact = false
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

  // Compact horizontal layout
  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactContainer}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactCardGradient}
        >
          <BlurView intensity={25} tint="dark" style={styles.compactCard}>
            <View style={styles.compactContent}>
            {/* Left: Logo or Placeholder */}
            {club.logo ? (
              <Image source={{ uri: club.logo }} style={styles.compactLogo} />
            ) : club.coverImage ? (
              <Image source={{ uri: club.coverImage }} style={styles.compactLogo} />
            ) : (
              <LinearGradient
                colors={['#1B365D', '#2B4A73', '#3A5F8F']}
                style={styles.compactLogoPlaceholder}
              >
                <IconButton
                  icon="account-group"
                  iconColor="#fff"
                  size={24}
                  style={{ margin: 0 }}
                />
              </LinearGradient>
            )}

            {/* Middle: Info */}
            <View style={styles.compactInfo}>
              <View style={styles.compactTitleRow}>
                <Text style={styles.compactName} numberOfLines={1}>
                  {club.name}
                </Text>
                {club.isPro && (
                  <View style={styles.compactProBadge}>
                    <IconButton
                      icon="crown"
                      iconColor="#FFD700"
                      size={12}
                      style={{ margin: 0 }}
                    />
                  </View>
                )}
              </View>
              <View style={styles.compactMetaRow}>
                <Text style={styles.compactCategory}>{club.category}</Text>
                <Text style={styles.compactSeparator}>•</Text>
                <IconButton
                  icon="account-multiple"
                  iconColor="rgba(255,255,255,0.6)"
                  size={12}
                  style={{ margin: 0, padding: 0 }}
                />
                <Text style={styles.compactMembers}>{club.members.length}</Text>
              </View>
              {club.tags && club.tags.length > 0 && (
                <View style={styles.compactTags}>
                  {club.tags.slice(0, 2).map((tag) => (
                    <View key={tag} style={styles.compactTag}>
                      <Text style={styles.compactTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right: Action Button */}
            {(onJoin || onLeave) && (
              <TouchableOpacity
                onPress={handleJoinLeave}
                disabled={loading}
                activeOpacity={0.7}
                style={styles.compactButtonContainer}
              >
                <BlurView
                  intensity={20}
                  tint="dark"
                  style={[
                    styles.compactButton,
                    isJoined ? styles.compactButtonJoined : styles.compactButtonNotJoined
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <IconButton
                      icon={isJoined ? "check" : "plus"}
                      iconColor={isJoined ? "#4CAF50" : "#60A5FA"}
                      size={20}
                      style={{ margin: 0 }}
                    />
                  )}
                </BlurView>
              </TouchableOpacity>
            )}
            </View>
          </BlurView>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Original full card layout
  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <BlurView intensity={10} tint="dark" style={styles.card}>
        {club.coverImage ? (
          <ImageBackground
            source={{ uri: club.coverImage }}
            style={styles.coverImage}
            imageStyle={styles.backgroundImage}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
              style={styles.gradient}
            >
              {renderCardContent()}
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={['#1B365D', '#2B4A73', '#3A5F8F']}
            style={styles.coverImage}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
              style={styles.gradient}
            >
              {renderCardContent()}
            </LinearGradient>
          </LinearGradient>
        )}
      </BlurView>
    </TouchableOpacity>
  );

  function renderCardContent() {
    return (
      <View style={styles.overlayContent}>
        {/* Header Section */}
        <View style={styles.header}>
                {club.logo ? (
                  <Image source={{ uri: club.logo }} style={styles.logo} />
                ) : (
                  <LinearGradient
                    colors={['#1B365D', '#2B4A73', '#3A5F8F']}
                    style={styles.logoPlaceholder}
                  >
                    <IconButton
                      icon="account-group"
                      iconColor="#fff"
                      size={28}
                      style={{ margin: 0 }}
                    />
                  </LinearGradient>
                )}
                <View style={styles.titleSection}>
                  <Text style={styles.clubName} numberOfLines={2}>
                    {club.name}
                  </Text>
                  <View style={styles.metaRow}>
                    <IconButton
                      icon="shape"
                      iconColor="rgba(255,255,255,0.7)"
                      size={14}
                      style={{ margin: 0, padding: 0 }}
                    />
                    <Text style={styles.category}>
                      {club.category}
                    </Text>
                    <Text style={styles.separator}>•</Text>
                    <IconButton
                      icon="account-multiple"
                      iconColor="rgba(255,255,255,0.7)"
                      size={14}
                      style={{ margin: 0, padding: 0 }}
                    />
                    <Text style={styles.members}>
                      {club.members.length}
                    </Text>
                  </View>
                </View>
                {club.isPro && (
                  <View style={styles.proBadge}>
                    <IconButton
                      icon="crown"
                      iconColor="#FFD700"
                      size={16}
                      style={{ margin: 0 }}
                    />
                  </View>
                )}
              </View>

              {/* Tags Section */}
              {club.tags && club.tags.length > 0 && (
                <View style={styles.tags}>
                  {club.tags.slice(0, 3).map((tag) => (
                    <BlurView
                      key={tag}
                      intensity={15}
                      tint="dark"
                      style={styles.tag}
                    >
                      <Text style={styles.tagText}>{tag}</Text>
                    </BlurView>
                  ))}
                </View>
              )}

              {/* Action Button */}
              {(onJoin || onLeave) && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={handleJoinLeave}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <BlurView
                      intensity={isJoined ? 15 : 30}
                      tint="dark"
                      style={[
                        styles.joinButton,
                        isJoined ? styles.joinedButton : styles.notJoinedButton
                      ]}
                    >
                      <View style={styles.buttonContent}>
                        {loading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <IconButton
                              icon={isJoined ? "check-circle" : "plus-circle"}
                              iconColor={isJoined ? "#4CAF50" : "#60A5FA"}
                              size={20}
                              style={{ margin: 0 }}
                            />
                            <Text style={styles.buttonText}>
                              {isJoined ? "Joined" : "Join Club"}
                            </Text>
                          </>
                        )}
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  cardContainer: {
    marginVertical: 8,
    marginHorizontal: 16,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  coverImage: {
    height: 240,
    width: '100%',
  },
  backgroundImage: {
    borderRadius: 20,
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  overlayContent: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  titleSection: {
    flex: 1,
    gap: 6,
  },
  clubName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  category: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  separator: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginHorizontal: 4,
  },
  members: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  proBadge: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    padding: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
  },
  joinButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  joinedButton: {
    borderColor: 'rgba(76,175,80,0.5)',
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  notJoinedButton: {
    borderColor: 'rgba(96,165,250,0.5)',
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Compact mode styles
  compactContainer: {
    marginVertical: 6,
    marginHorizontal: 16,
  },
  compactCardGradient: {
    borderRadius: 16,
    padding: 2,
  },
  compactCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,30,48,0.8)',
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  compactLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  compactLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  compactInfo: {
    flex: 1,
    gap: 4,
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  compactProBadge: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    padding: 2,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactCategory: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  compactSeparator: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  compactMembers: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  compactTags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  compactTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  compactTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  compactButtonContainer: {
    marginLeft: 8,
  },
  compactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  compactButtonJoined: {
    borderColor: 'rgba(76,175,80,0.5)',
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  compactButtonNotJoined: {
    borderColor: 'rgba(96,165,250,0.5)',
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
});
