// lib/eventShare.ts - Shared "share this event" link builder
import { Platform } from 'react-native';
import type { Event } from './firebase';

export const getEventShareUrl = (eventId: string) => `https://rally-sphere.web.app/event/${eventId}`;

// iOS: share the bare URL so Messages/etc. unfurl a single rich preview card
// (image + title) instead of a plain text bubble. Android's Share API has no
// separate "url" concept, so the link is passed as the message body there.
export const buildEventShareContent = (event: Event) => {
  const shareUrl = getEventShareUrl(event.id);

  return Platform.OS === 'ios'
    ? { url: shareUrl, title: event.title }
    : { message: shareUrl, title: event.title };
};
