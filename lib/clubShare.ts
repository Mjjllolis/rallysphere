// lib/clubShare.ts - Shared "share this club" link builder
import { Platform } from 'react-native';
import type { Club } from './firebase';

export const getClubShareUrl = (clubId: string) => `https://rally-sphere.web.app/club/${clubId}`;

// Same platform split as buildEventShareContent — iOS gets the bare URL so it
// unfurls into a rich preview card; Android takes it as the message body.
export const buildClubShareContent = (club: Club) => {
  const shareUrl = getClubShareUrl(club.id);

  return Platform.OS === 'ios'
    ? { url: shareUrl, title: club.name }
    : { message: shareUrl, title: club.name };
};
