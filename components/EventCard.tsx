// components/EventCard.tsx
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
import type { Event } from '../lib/firebase';

interface EventCardProps {
  event: Event;
  isAttending?: boolean;
  isWaitlisted?: boolean;
  onJoin?: (eventId: string) => Promise<void>;
  onLeave?: (eventId: string) => Promise<void>;
  loading?: boolean;
}

export default function EventCard({ 
  event, 
  isAttending = false, 
  isWaitlisted = false,
  onJoin, 
  onLeave,
  loading = false 
}: EventCardProps) {
  const theme = useTheme();

  const handlePress = () => {
    router.push(`/event/${event.id}`);
  };

  const handleJoinLeave = async () => {
    if ((isAttending || isWaitlisted) && onLeave) {
      await onLeave(event.id);
    } else if (!isAttending && !isWaitlisted && onJoin) {
      await onJoin(event.id);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleDateString([], { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      year: eventDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const formatTime = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return eventDate.toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  const getEventStatus = () => {
    if (isWaitlisted) return { text: 'Waitlisted', color: theme.colors.tertiary };
    if (isAttending) return { text: 'Attending', color: theme.colors.primary };
    return null;
  };

  const eventStatus = getEventStatus();
  const startDate = event.startDate;
  const endDate = event.endDate;
  const isUpcoming = startDate && new Date(startDate.toDate ? startDate.toDate() : startDate) > new Date();
  const isPast = endDate && new Date(endDate.toDate ? endDate.toDate() : endDate) < new Date();

  return (
    <Card style={[styles.card, isPast && styles.pastEvent]} onPress={handlePress}>
      {event.coverImage && (
        <Card.Cover source={{ uri: event.coverImage }} style={styles.coverImage} />
      )}
      
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <View style={styles.dateSection}>
            <Text variant="titleSmall" style={[styles.date, { color: theme.colors.primary }]}>
              {formatDate(startDate)}
            </Text>
            <Text variant="bodySmall" style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>
              {formatTime(startDate)}
              {endDate && ` - ${formatTime(endDate)}`}
            </Text>
          </View>
          
          {eventStatus && (
            <Chip 
              compact 
              style={[styles.statusChip, { backgroundColor: eventStatus.color + '20' }]}
              textStyle={{ color: eventStatus.color, fontSize: 12 }}
            >
              {eventStatus.text}
            </Chip>
          )}
        </View>

        <Text variant="titleMedium" style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>

        <Text variant="bodySmall" style={[styles.clubName, { color: theme.colors.primary }]}>
          by {event.clubName}
        </Text>

        <Text variant="bodyMedium" style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>

        <View style={styles.footer}>
          <View style={styles.eventInfo}>
            <View style={styles.infoRow}>
              <Text variant="bodySmall" style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
                {event.isVirtual ? '🌐 Virtual' : `📍 ${event.location}`}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text variant="bodySmall" style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
                👥 {event.attendees.length}
                {event.maxAttendees ? ` / ${event.maxAttendees}` : ''} attending
              </Text>
              
              {event.ticketPrice && (
                <Text variant="bodySmall" style={[styles.price, { color: theme.colors.tertiary }]}>
                  ${event.ticketPrice}
                </Text>
              )}
            </View>
          </View>

          {(onJoin || onLeave) && isUpcoming && (
            <Button
              mode={isAttending || isWaitlisted ? "outlined" : "contained"}
              compact
              loading={loading}
              onPress={handleJoinLeave}
              style={styles.joinButton}
              disabled={event.maxAttendees && event.attendees.length >= event.maxAttendees && !isAttending && !isWaitlisted}
            >
              {isWaitlisted ? "Leave Waitlist" : isAttending ? "Leave Event" : 
               (event.maxAttendees && event.attendees.length >= event.maxAttendees ? "Full" : "Join")}
            </Button>
          )}
        </View>

        {event.tags && event.tags.length > 0 && (
          <View style={styles.tags}>
            {event.tags.slice(0, 3).map((tag) => (
              <Chip key={tag} compact style={styles.tag}>
                {tag}
              </Chip>
            ))}
            {event.tags.length > 3 && (
              <Text variant="bodySmall" style={[styles.moreTags, { color: theme.colors.onSurfaceVariant }]}>
                +{event.tags.length - 3} more
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
  pastEvent: {
    opacity: 0.7,
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
    marginBottom: 8,
  },
  dateSection: {
    flex: 1,
  },
  date: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  eventTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 20,
  },
  clubName: {
    fontWeight: '500',
    marginBottom: 8,
    fontSize: 12,
  },
  description: {
    marginBottom: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
    marginRight: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 12,
  },
  price: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  joinButton: {
    alignSelf: 'flex-end',
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
