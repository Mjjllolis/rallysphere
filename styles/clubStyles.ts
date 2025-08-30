// styles/clubStyles.ts
import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const clubStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        margin: 20,
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '600',
    },
    topNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 10,
        paddingHorizontal: 20,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    backButton: {
        margin: 0,
    },
    headerContainer: {
        marginBottom: 24,
    },
    headerImage: {
        width: width,
        height: 280,
        justifyContent: 'flex-end',
    },
    headerNoImage: {
        width: width,
        height: 280,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerGradientOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: 24,
    },
    clubInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    avatarContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    avatarShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    clubDetails: {
        flex: 1,
    },
    clubName: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    memberInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    memberCount: {
        fontSize: 16,
        fontWeight: '500',
    },
    actionButtonsContainer: {
        marginHorizontal: 20,
        marginTop: -30,
    },
    actionButtonsSurface: {
        borderRadius: 16,
    },
    surfaceContent: {
        borderRadius: 16,
    },
    actionButtonsGradient: {
        padding: 20,
        borderRadius: 16,
    },
    primaryActionButton: {
        marginBottom: 12,
        borderRadius: 12,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    secondaryActionButton: {
        borderRadius: 12,
        borderWidth: 2,
    },
    actionButtonLabel: {
        fontSize: 16,
        fontWeight: '600',
        paddingVertical: 8,
    },
    descriptionCard: {
        marginHorizontal: 20,
        marginBottom: 24,
        borderRadius: 16,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardContentWrapper: {
        borderRadius: 16,
    },
    cardGradient: {
        borderRadius: 16,
    },
    descriptionContent: {
        padding: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
    },
    eventsHeader: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 16,
    },
    eventsHeaderGradient: {
        padding: 20,
        borderRadius: 16,
    },
    eventsHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    eventsTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    eventsCount: {
        fontSize: 14,
        fontWeight: '500',
    },
    eventsContainer: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    eventCard: {
        marginBottom: 16,
        borderRadius: 16,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    eventCardGradient: {
        borderRadius: 16,
    },
    eventCardContent: {
        padding: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    eventTitleContainer: {
        flex: 1,
        marginRight: 12,
    },
    eventTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    eventTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 6,
        flex: 1,
    },
    eventMenuButton: {
        margin: 0,
        width: 24,
        height: 24,
    },
    eventSubInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    eventDate: {
        fontSize: 12,
        fontWeight: '500',
    },
    eventDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    detailText: {
        fontSize: 14,
        fontWeight: '500',
    },
    eventCardActions: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 8,
    },
    actionButton: {
        borderRadius: 8,
    },
    viewAllButton: {
        marginTop: 8,
        borderRadius: 12,
    },
    emptyStateCard: {
        marginHorizontal: 20,
        borderRadius: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    emptyStateGradient: {
        borderRadius: 20,
    },
    emptyStateContent: {
        padding: 40,
        alignItems: 'center',
        gap: 16,
    },
    emptyIconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 8,
    },
    emptyActionButton: {
        borderRadius: 12,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 100, // Above tab bar
        right: 20,
    },
    fabWrapper: {
        borderRadius: 16,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    fabGradient: {
        borderRadius: 16,
        padding: 2,
    },
    fab: {
        margin: 0,
        borderRadius: 14,
    },
});
