// lib/clubBadges.ts - Live pending-count updates for the club admin dashboard
//
// Sub-pages (co-hosting, member management) publish their pending counts as
// they change, and the dashboard - still mounted underneath in the stack -
// updates its badges immediately before the admin navigates back

export type ClubBadge = 'coHostRequests' | 'joinRequests';

type Listener = (clubId: string, badge: ClubBadge, count: number) => void;

const listeners = new Set<Listener>();

export function publishClubBadge(clubId: string, badge: ClubBadge, count: number) {
  listeners.forEach((listener) => listener(clubId, badge, count));
}

/** Returns an unsubscribe function. */
export function subscribeClubBadges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
