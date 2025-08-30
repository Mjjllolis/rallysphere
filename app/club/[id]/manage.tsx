// app/club/[id]/manage.tsx - Club Management Screen
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    RefreshControl,
    Alert,
} from 'react-native';
import {
    Card,
    Title,
    Button,
    useTheme,
    Avatar,
    IconButton,
    List,
    Divider,
    TextInput,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../_layout';
import { router, useLocalSearchParams } from 'expo-router';
import {
    getClub,
    updateClub,
    isClubAdmin,
    getUserProfile,
    removeClubMember,
    makeClubAdmin,
    removeClubAdmin,
    type Club,
    type UserProfile
} from '../../../lib/firebase/firestore-functions';

export default function ClubManagePage() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [club, setClub] = useState<Club | null>(null);
    const [members, setMembers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);
    const [newClubName, setNewClubName] = useState('');
    const [newDescription, setNewDescription] = useState('');

    const loadClubData = async () => {
        if (!id) return;

        try {
            const clubData = await getClub(id);
            if (!clubData) {
                Alert.alert('Error', 'Club not found.');
                router.back();
                return;
            }
            
            // Check if user is admin
            if (!user || !isClubAdmin(clubData, user.uid)) {
                Alert.alert('Access Denied', 'You do not have permission to manage this club.');
                router.back();
                return;
            }

            setClub(clubData);
            setNewClubName(clubData.clubName);
            setNewDescription(clubData.description);

            // Load member profiles
            const memberProfiles = await Promise.all(
                clubData.clubMembers.map(memberId => getUserProfile(memberId))
            );
            setMembers(memberProfiles.filter(profile => profile !== null) as UserProfile[]);

        } catch (error) {
            console.error('Error loading club data:', error);
            Alert.alert('Error', 'Failed to load club data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClubData();
    }, [id]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        loadClubData().finally(() => setRefreshing(false));
    }, [id]);

    const handleUpdateClubName = async () => {
        if (!club || !newClubName.trim()) return;

        try {
            await updateClub(club.id, { clubName: newClubName.trim() });
            setEditingName(false);
            await loadClubData();
            Alert.alert('Success', 'Club name updated successfully.');
        } catch (error) {
            console.error('Error updating club name:', error);
            Alert.alert('Error', 'Failed to update club name.');
        }
    };

    const handleUpdateDescription = async () => {
        if (!club) return;

        try {
            await updateClub(club.id, { description: newDescription.trim() });
            setEditingDescription(false);
            await loadClubData();
            Alert.alert('Success', 'Club description updated successfully.');
        } catch (error) {
            console.error('Error updating club description:', error);
            Alert.alert('Error', 'Failed to update club description.');
        }
    };

    const handleRemoveMember = async (memberId: string, memberName: string) => {
        if (!club || !user) return;

        Alert.alert(
            'Remove Member',
            `Are you sure you want to remove ${memberName} from the club?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await removeClubMember(club.id, memberId);
                            await loadClubData();
                            Alert.alert('Success', `${memberName} has been removed from the club.`);
                        } catch (error) {
                            console.error('Error removing member:', error);
                            Alert.alert('Error', 'Failed to remove member.');
                        }
                    },
                },
            ]
        );
    };

    const handleMakeAdmin = async (memberId: string, memberName: string) => {
        if (!club) return;

        try {
            await makeClubAdmin(club.id, memberId);
            await loadClubData();
            Alert.alert('Success', `${memberName} is now an admin.`);
        } catch (error) {
            console.error('Error making admin:', error);
            Alert.alert('Error', 'Failed to make user admin.');
        }
    };

    const handleRemoveAdmin = async (memberId: string, memberName: string) => {
        if (!club) return;

        try {
            await removeClubAdmin(club.id, memberId);
            await loadClubData();
            Alert.alert('Success', `${memberName} is no longer an admin.`);
        } catch (error) {
            console.error('Error removing admin:', error);
            Alert.alert('Error', 'Failed to remove admin privileges.');
        }
    };

    const getUserRole = (memberId: string) => {
        if (!club) return 'member';
        if (club.clubOwner === memberId) return 'owner';
        if (club.clubAdmins.includes(memberId)) return 'admin';
        return 'member';
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'owner': return colors.primary;
            case 'admin': return '#D97706'; // Amber
            default: return '#059669'; // Emerald
        }
    };

    if (loading || !club) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading club management...
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <View style={styles.headerContent}>
                    <IconButton
                        icon="arrow-left"
                        size={24}
                        iconColor={colors.onSurface}
                        onPress={() => router.back()}
                        style={styles.backButton}
                    />
                    <View style={styles.headerText}>
                        <Title style={[styles.title, { color: colors.onSurface }]}>
                            Manage Club
                        </Title>
                        <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
                            {club.clubName}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                {/* Club Settings */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Club Settings
                        </Title>

                        {/* Club Name */}
                        <View style={styles.settingRow}>
                            <View style={styles.settingContent}>
                                <Text style={[styles.settingLabel, { color: colors.onSurface }]}>
                                    Club Name
                                </Text>
                                {editingName ? (
                                    <TextInput
                                        value={newClubName}
                                        onChangeText={setNewClubName}
                                        style={styles.textInput}
                                        mode="outlined"
                                        dense
                                    />
                                ) : (
                                    <Text style={[styles.settingValue, { color: colors.onSurfaceVariant }]}>
                                        {club.clubName}
                                    </Text>
                                )}
                            </View>
                            <View style={styles.settingActions}>
                                {editingName ? (
                                    <>
                                        <Button
                                            mode="text"
                                            onPress={() => {
                                                setEditingName(false);
                                                setNewClubName(club.clubName);
                                            }}
                                            textColor={colors.onSurfaceVariant}
                                            compact
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={handleUpdateClubName}
                                            disabled={!newClubName.trim()}
                                            compact
                                        >
                                            Save
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        mode="outlined"
                                        onPress={() => setEditingName(true)}
                                        icon="pencil"
                                        compact
                                    >
                                        Edit
                                    </Button>
                                )}
                            </View>
                        </View>

                        <Divider style={{ marginVertical: 16 }} />

                        {/* Description */}
                        <View style={styles.settingRow}>
                            <View style={styles.settingContent}>
                                <Text style={[styles.settingLabel, { color: colors.onSurface }]}>
                                    Description
                                </Text>
                                {editingDescription ? (
                                    <TextInput
                                        value={newDescription}
                                        onChangeText={setNewDescription}
                                        style={styles.textInput}
                                        mode="outlined"
                                        multiline
                                        numberOfLines={3}
                                    />
                                ) : (
                                    <Text style={[styles.settingValue, { color: colors.onSurfaceVariant }]}>
                                        {club.description || 'No description'}
                                    </Text>
                                )}
                            </View>
                            <View style={styles.settingActions}>
                                {editingDescription ? (
                                    <>
                                        <Button
                                            mode="text"
                                            onPress={() => {
                                                setEditingDescription(false);
                                                setNewDescription(club.description);
                                            }}
                                            textColor={colors.onSurfaceVariant}
                                            compact
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={handleUpdateDescription}
                                            compact
                                        >
                                            Save
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        mode="outlined"
                                        onPress={() => setEditingDescription(true)}
                                        icon="pencil"
                                        compact
                                    >
                                        Edit
                                    </Button>
                                )}
                            </View>
                        </View>
                    </Card.Content>
                </Card>

                {/* Members Management */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Members ({members.length})
                        </Title>

                        {members.map((member, index) => {
                            const role = getUserRole(member.id);
                            const isCurrentUser = user?.uid === member.id;
                            const canManage = role !== 'owner' && !isCurrentUser;
                            
                            return (
                                <View key={member.id}>
                                    <List.Item
                                        title={member.displayName || member.email.split('@')[0]}
                                        description={member.email}
                                        left={() => (
                                            member.avatar ? (
                                                <Avatar.Image size={50} source={{ uri: member.avatar }} />
                                            ) : (
                                                <Avatar.Text
                                                    size={50}
                                                    label={(member.displayName || member.email).substring(0, 2).toUpperCase()}
                                                    style={{ backgroundColor: getRoleColor(role) }}
                                                />
                                            )
                                        )}
                                        right={() => (
                                            <View style={styles.memberActions}>
                                                <View style={[styles.roleBadge, { backgroundColor: getRoleColor(role) + '20' }]}>
                                                    <Text style={[styles.roleText, { color: getRoleColor(role) }]}>
                                                        {role.toUpperCase()}
                                                    </Text>
                                                </View>
                                                {canManage && (
                                                    <View style={styles.memberButtons}>
                                                        {role === 'member' ? (
                                                            <Button
                                                                mode="outlined"
                                                                onPress={() => handleMakeAdmin(member.id, member.displayName || member.email.split('@')[0])}
                                                                icon="shield-account"
                                                                compact
                                                                style={styles.actionButton}
                                                            >
                                                                Make Admin
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                mode="text"
                                                                onPress={() => handleRemoveAdmin(member.id, member.displayName || member.email.split('@')[0])}
                                                                textColor={colors.onSurfaceVariant}
                                                                icon="shield-off"
                                                                compact
                                                                style={styles.actionButton}
                                                            >
                                                                Remove Admin
                                                            </Button>
                                                        )}
                                                        <Button
                                                            mode="text"
                                                            onPress={() => handleRemoveMember(member.id, member.displayName || member.email.split('@')[0])}
                                                            textColor={colors.error}
                                                            icon="account-minus"
                                                            compact
                                                            style={styles.actionButton}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    />
                                    {index < members.length - 1 && <Divider />}
                                </View>
                            );
                        })}
                    </Card.Content>
                </Card>

                {/* Quick Actions */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Quick Actions
                        </Title>

                        <View style={styles.quickActions}>
                            <Button
                                mode="contained"
                                onPress={() => router.push(`/event/create?clubId=${club.id}`)}
                                icon="calendar-plus"
                                style={styles.quickActionButton}
                            >
                                Create Event
                            </Button>

                            <Button
                                mode="outlined"
                                onPress={() => router.push(`/club/${club.id}/edit`)}
                                icon="image-edit"
                                style={styles.quickActionButton}
                            >
                                Edit Images
                            </Button>

                            <Button
                                mode="outlined"
                                onPress={() => {
                                    Alert.alert('Coming Soon', 'Invite functionality will be available soon.');
                                }}
                                icon="account-plus"
                                style={styles.quickActionButton}
                            >
                                Invite Members
                            </Button>
                        </View>
                    </Card.Content>
                </Card>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    header: {
        paddingTop: 60,
        paddingBottom: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    backButton: {
        margin: 0,
        marginRight: 16,
    },
    headerText: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    card: {
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
        marginBottom: 16,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16,
    },
    settingContent: {
        flex: 1,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    settingValue: {
        fontSize: 14,
        lineHeight: 20,
    },
    settingActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    textInput: {
        marginBottom: 8,
    },
    memberActions: {
        alignItems: 'flex-end',
        gap: 8,
    },
    roleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignItems: 'center',
        minWidth: 80,
    },
    roleText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    memberButtons: {
        flexDirection: 'row',
        gap: 4,
    },
    actionButton: {
        minWidth: 0,
    },
    quickActions: {
        gap: 12,
    },
    quickActionButton: {
        marginBottom: 8,
    },
});
