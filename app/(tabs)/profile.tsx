// app/(tabs)/profile.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Alert
} from 'react-native';
import {
    Card,
    Title,
    Paragraph,
    Button,
    Avatar,
    List,
    Divider,
    useTheme,
    Switch,
    IconButton
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth, useThemeToggle } from '../_layout';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase/auth';
import { getUserProfile, createUserProfile } from '../../lib/firebase/firestore-functions';
import { router } from 'expo-router';

export default function ProfilePage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { toggleTheme, isDark } = useThemeToggle();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (user?.uid) {
                const profile = await getUserProfile(user.uid);
                setUserProfile(profile);
            }
        };
        fetchProfile();
    }, [user]);

    const handleSignOut = async () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await signOut(auth);
                            router.replace('/(auth)/welcome');
                        } catch (error) {
                            console.error('Sign out error:', error);
                        }
                    }
                }
            ]
        );
    };

    const getInitials = (email: string) => {
        return email.substring(0, 2).toUpperCase();
    };

    // Mock user stats
    const userStats = {
        clubsJoined: 2,
        eventsAttended: 8,
        tournamentsWon: 1,
        memberSince: '2024-12-01'
    };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            showsVerticalScrollIndicator={false}
        >
            {/* Profile Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <Avatar.Text
                    size={80}
                    label={getInitials(user?.email || 'U')}
                    style={{ backgroundColor: colors.primary }}
                />
                <Text style={[styles.name, { color: colors.onSurface }]}>
                    {user?.displayName || user?.email?.split('@')[0] || 'Player'}
                </Text>
                <Text style={[styles.email, { color: colors.onSurfaceVariant }]}>
                    {user?.email}
                </Text>
                {userProfile?.birthday && (
                    <Text style={[styles.birthday, { color: colors.onSurfaceVariant }]}>
                        🎂 Born {userProfile.birthday.toDate().toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                        })}
                    </Text>
                )}
                <Text style={[styles.memberSince, { color: colors.onSurfaceVariant }]}>
                    Member since {userProfile?.createdAt?.toDate().toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric'
                    }) || 'Recently'}
                </Text>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
                <View style={styles.statsRow}>
                    <Card style={[styles.statCard, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.statContent}>
                            <MaterialCommunityIcons
                                name="account-group"
                                size={24}
                                color={colors.primary}
                            />
                            <Text style={[styles.statNumber, { color: colors.onSurface }]}>
                                {userStats.clubsJoined}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                                Clubs
                            </Text>
                        </Card.Content>
                    </Card>

                    <Card style={[styles.statCard, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.statContent}>
                            <MaterialCommunityIcons
                                name="calendar-check"
                                size={24}
                                color={colors.primary}
                            />
                            <Text style={[styles.statNumber, { color: colors.onSurface }]}>
                                {userStats.eventsAttended}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                                Events
                            </Text>
                        </Card.Content>
                    </Card>
                </View>

                <View style={styles.statsRow}>
                    <Card style={[styles.statCard, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.statContent}>
                            <MaterialCommunityIcons
                                name="trophy"
                                size={24}
                                color={colors.primary}
                            />
                            <Text style={[styles.statNumber, { color: colors.onSurface }]}>
                                {userStats.tournamentsWon}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                                Trophies
                            </Text>
                        </Card.Content>
                    </Card>

                    <Card style={[styles.statCard, { backgroundColor: colors.surface }]} mode="outlined">
                        <Card.Content style={styles.statContent}>
                            <MaterialCommunityIcons
                                name="star"
                                size={24}
                                color={colors.primary}
                            />
                            <Text style={[styles.statNumber, { color: colors.onSurface }]}>
                                4.8
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                                Rating
                            </Text>
                        </Card.Content>
                    </Card>
                </View>
            </View>

            {/* Settings Section */}
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                        Settings
                    </Title>
                </Card.Content>

                <List.Item
                    title="Edit Profile"
                    description="Update your personal information"
                    left={(props) => <List.Icon {...props} icon="account-edit" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Edit profile')}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Notifications"
                    description="Manage your notification preferences"
                    left={(props) => <List.Icon {...props} icon="bell" />}
                    right={() => (
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={setNotificationsEnabled}
                        />
                    )}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Dark Mode"
                    description="Switch between light and dark theme"
                    left={(props) => <List.Icon {...props} icon={isDark ? "moon-waning-crescent" : "white-balance-sunny"} />}
                    right={() => (
                        <Switch
                            value={isDark}
                            onValueChange={toggleTheme}
                        />
                    )}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Privacy"
                    description="Control your privacy settings"
                    left={(props) => <List.Icon {...props} icon="shield-account" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Privacy settings')}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />
            </Card>

            {/* Support Section */}
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                        Support
                    </Title>
                </Card.Content>

                <List.Item
                    title="Help & FAQ"
                    description="Get answers to common questions"
                    left={(props) => <List.Icon {...props} icon="help-circle" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Help & FAQ')}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Contact Support"
                    description="Reach out to our support team"
                    left={(props) => <List.Icon {...props} icon="message" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Contact support')}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Rate App"
                    description="Share your feedback"
                    left={(props) => <List.Icon {...props} icon="star-outline" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Rate app')}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />
            </Card>

            {/* About Section */}
            <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                <Card.Content>
                    <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                        About
                    </Title>
                </Card.Content>

                <List.Item
                    title="Terms of Service"
                    left={(props) => <List.Icon {...props} icon="file-document" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Terms of service')}
                    titleStyle={{ color: colors.onSurface }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="Privacy Policy"
                    left={(props) => <List.Icon {...props} icon="shield-check" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => console.log('Privacy policy')}
                    titleStyle={{ color: colors.onSurface }}
                />

                <Divider style={{ backgroundColor: colors.outline }} />

                <List.Item
                    title="App Version"
                    description="1.0.0"
                    left={(props) => <List.Icon {...props} icon="information" />}
                    titleStyle={{ color: colors.onSurface }}
                    descriptionStyle={{ color: colors.onSurfaceVariant }}
                />
            </Card>

            {/* Sign Out Button */}
            <View style={styles.signOutContainer}>
                <Button
                    mode="outlined"
                    onPress={handleSignOut}
                    icon="logout"
                    buttonColor={colors.errorContainer}
                    textColor={colors.error}
                    style={[styles.signOutButton, { borderColor: colors.error }]}
                >
                    Sign Out
                </Button>
            </View>

            {/* Bottom Spacing */}
            <View style={{ height: 32 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        padding: 24,
        paddingTop: 60,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        marginBottom: 16,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 4,
    },
    email: {
        fontSize: 16,
        marginBottom: 4,
    },
    birthday: {
        fontSize: 14,
        marginBottom: 4,
    },
    memberSince: {
        fontSize: 14,
    },
    statsContainer: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    statCard: {
        flex: 1,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    statContent: {
        alignItems: 'center',
        gap: 4,
        paddingVertical: 8,
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    statLabel: {
        fontSize: 12,
        textAlign: 'center',
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    signOutContainer: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    signOutButton: {
        // borderColor will be set dynamically in the component
    },
});
