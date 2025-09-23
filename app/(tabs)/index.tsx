// app/(tabs)/index.tsx - Beautiful Home Page
import React from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Dimensions,
    TouchableOpacity,
} from 'react-native';
import {
    Text,
    IconButton,
    Surface,
    useTheme
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../_layout';

const { width, height } = Dimensions.get('window');

const CATEGORIES = [
    {
        id: 'events',
        title: 'Events',
        icon: '📅',
        route: '/(tabs)/events'
    },
    {
        id: 'clubs',
        title: 'Clubs',
        icon: '🏆',
        route: '/(tabs)/clubs'
    },
    {
        id: 'profile',
        title: 'Profile',
        icon: '👤',
        route: '/(tabs)/profile'
    }
];

export default function HomePage() {
    const theme = useTheme();
    const { user } = useAuth();

    const CategoryCard = ({ category }: { category: any }) => (
        <TouchableOpacity
            style={styles.categoryCard}
            onPress={() => router.push(category.route)}
            activeOpacity={0.8}
        >
            <Surface style={[styles.categoryCardSurface]} elevation={3}>
                <View style={styles.iconContainer}>
                    <Text style={styles.categoryIcon}>{category.icon}</Text>
                </View>
                <Text style={[styles.categoryTitle, { color: theme.colors.onSurface }]}>
                    {category.title}
                </Text>
            </Surface>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: 'white' }]}>
            {/* Beautiful Navy Gradient Header */}
            <LinearGradient
                colors={['#2C5282', '#2A4B7C']}
                style={styles.header}
            >
                {/* Header Content */}
                <View style={styles.headerContent}>
                    <Text style={styles.logoText}>RallySphere</Text>
                    <Text style={styles.headerTitle}>Welcome back, Mishawn!</Text>
                </View>

                {/* Decorative Elements - matching login screen */}
                <View style={styles.decorativeCircle1} />
                <View style={styles.decorativeCircle2} />
                <View style={styles.decorativeCircle3} />

                {/* White Rounded Bottom */}
                <View style={[styles.headerBottom, { backgroundColor: 'white' }]} />
            </LinearGradient>

            {/* Content Area */}
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.contentContainer}
            >
                {/* Categories Grid */}
                <View style={styles.categoriesContainer}>
                    {CATEGORIES.map((category) => (
                        <CategoryCard key={category.id} category={category} />
                    ))}
                </View>

                {/* Quick Actions */}
                <Surface style={styles.quickActionsCard} elevation={2}>
                    <Text style={[styles.quickActionsTitle, { color: theme.colors.onSurface }]}>
                        Quick Actions
                    </Text>

                    <TouchableOpacity
                        style={styles.quickActionButton}
                        onPress={() => router.push('/(tabs)/create-club')}
                    >
                        <View style={[styles.quickActionIcon, { backgroundColor: '#4ECDC4' }]}>
                            <Text style={styles.quickActionEmoji}>🏆</Text>
                        </View>
                        <View style={styles.quickActionContent}>
                            <Text style={[styles.quickActionText, { color: theme.colors.onSurface }]}>
                                Create Club
                            </Text>
                            <Text style={[styles.quickActionSubtext, { color: theme.colors.onSurfaceVariant }]}>
                                Start your own community
                            </Text>
                        </View>
                        <IconButton
                            icon="chevron-right"
                            iconColor={theme.colors.onSurfaceVariant}
                            size={20}
                        />
                    </TouchableOpacity>
                </Surface>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        height: height * 0.25,
        position: 'relative',
    },
    headerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 40,
        paddingTop: 40,
    },
    logoText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: 'white',
        textAlign: 'center',
    },
    headerBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 30,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
    },
    decorativeCircle1: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        top: -50,
        right: -50,
    },
    decorativeCircle2: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: 'rgba(255,255,255,0.03)',
        bottom: -30,
        left: -30,
    },
    decorativeCircle3: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: height * 0.15,
        left: -20,
    },
    content: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    contentContainer: {
        paddingTop: 20,
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    welcomeSection: {
        marginBottom: 32,
        alignItems: 'center',
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    welcomeSubtext: {
        fontSize: 16,
        textAlign: 'center',
        opacity: 0.8,
    },
    categoriesContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        paddingHorizontal: 10,
    },
    categoryCard: {
        flex: 1,
        marginHorizontal: 8,
    },
    categoryCardSurface: {
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
    },
    iconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: 'white',
    },
    categoryIcon: {
        fontSize: 28,
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    quickActionsCard: {
        borderRadius: 16,
        padding: 20,
    },
    quickActionsTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    quickActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    quickActionIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    quickActionEmoji: {
        fontSize: 24,
    },
    quickActionContent: {
        flex: 1,
    },
    quickActionText: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    quickActionSubtext: {
        fontSize: 14,
        opacity: 0.7,
    },
});
