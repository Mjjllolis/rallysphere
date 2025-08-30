// styles/eventStyles.ts
import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const eventStyles = StyleSheet.create({
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
    imageContainer: {
        width: width,
        height: width * (9/16), // 16:9 aspect ratio
        marginBottom: 16,
    },
    eventImage: {
        width: '100%',
        height: '100%',
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
    cardContent: {
        padding: 20,
    },
    eventHeader: {
        marginBottom: 16,
    },
    eventTitleSection: {
        marginBottom: 12,
    },
    eventTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    eventMeta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    clubSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    clubLink: {
        fontSize: 16,
        fontWeight: '500',
        textDecorationLine: 'underline',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    detailsGrid: {
        gap: 20,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16,
    },
    detailContent: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    detailText: {
        fontSize: 14,
        lineHeight: 20,
    },
    description: {
        lineHeight: 24,
        fontSize: 16,
    },
    moreParticipants: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    moreText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    actionButtons: {
        gap: 12,
    },
    actionButton: {
        paddingVertical: 4,
    },
    joinClubPrompt: {
        alignItems: 'center',
        padding: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    promptText: {
        fontSize: 14,
        textAlign: 'center',
    },
    fullEventMessage: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
    },
    fullEventText: {
        fontSize: 16,
        fontWeight: '500',
    },
});
