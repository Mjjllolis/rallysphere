import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useThemeToggle } from "@/theme/ThemeContext";
import { useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { View, Text, Pressable, StyleSheet } from "react-native";

const Tab = createBottomTabNavigator();

function PlayerScreen() {
    const { colors } = useTheme();
    return (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.onBackground }]}>Welcome, Player 👟</Text>
            <Text style={{ color: colors.onBackground }}>Track matches, level up, and unlock rewards.</Text>
        </View>
    );
}

function ClubScreen() {
    const { colors } = useTheme();
    return (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.onBackground }]}>Welcome, Club Admin 🏟️</Text>
            <Text style={{ color: colors.onBackground }}>Manage events, payments, and memberships.</Text>
        </View>
    );
}

export default function AppTabs() {
    const { toggleTheme, isDark } = useThemeToggle();
    const { colors } = useTheme();

    return (
        <>
            <Tab.Navigator screenOptions={{ headerShown: false }}>
                <Tab.Screen
                    name="Players"
                    component={PlayerScreen}
                    options={{
                        tabBarIcon: ({ color, size }) => (
                            <MaterialCommunityIcons name="account" color={color} size={size} />
                        ),
                    }}
                />
                <Tab.Screen
                    name="Clubs"
                    component={ClubScreen}
                    options={{
                        tabBarIcon: ({ color, size }) => (
                            <MaterialCommunityIcons name="tennis-ball" color={color} size={size} />
                        ),
                    }}
                />
            </Tab.Navigator>

            <Pressable
                style={[styles.toggle, { backgroundColor: colors.surfaceVariant }]}
                onPress={toggleTheme}
            >
                <MaterialCommunityIcons
                    name={isDark ? "white-balance-sunny" : "moon-waning-crescent"}
                    size={28}
                    color={colors.onSurfaceVariant}
                />
            </Pressable>
        </>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
    },
    toggle: {
        position: "absolute",
        bottom: 32,
        right: 24,
        padding: 12,
        borderRadius: 32,
        elevation: 5,
    },
});