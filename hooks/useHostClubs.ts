// hooks/useHostClubs.ts
// Host + co-host clubs for an event, with each club's *current* name and logo.
//
// Events store a snapshot of club names/logos from when they were created (or
// when a co-host accepted), so a club that later changes its logo would keep
// showing the old one. This starts from that snapshot for an instant render,
// then swaps in live club data. Results are cached in memory so a feed of
// swipe cards from the same clubs doesn't re-read each club per card.
import { useEffect, useMemo, useState } from 'react';
import { getClub, type Event } from '../lib/firebase';
import type { HostAvatar } from '../components/HostAvatarStack';

/** A hosting club plus who administers it (only known once live data loads). */
export type HostClub = HostAvatar & { adminIds?: string[] };

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { host: HostClub | null; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<HostClub | null>>();

/** Drop a club from the cache - call after the club's name/logo is edited. */
export function invalidateHostClub(clubId: string) {
  cache.delete(clubId);
}

function fetchHost(clubId: string, force: boolean): Promise<HostClub | null> {
  const cached = cache.get(clubId);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.host);
  }
  const pending = inFlight.get(clubId);
  if (pending) return pending;

  const request = getClub(clubId)
    .then((result) => {
      const host = result.success && result.club
        ? {
            id: clubId,
            name: result.club.name,
            logo: result.club.logo,
            adminIds: [...(result.club.admins || []), ...(result.club.owner ? [result.club.owner] : [])],
          }
        : null;
      cache.set(clubId, { host, fetchedAt: Date.now() });
      return host;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(clubId));
  inFlight.set(clubId, request);
  return request;
}

/**
 * @param refreshKey change this (e.g. on pull-to-refresh) to bypass the cache
 */
export function useHostClubs(
  event: Pick<Event, 'clubId' | 'clubName' | 'clubLogo' | 'coHostClubs'> | null,
  refreshKey = 0
): HostClub[] {
  const snapshot = useMemo<HostAvatar[]>(
    () =>
      event?.clubId
        ? [{ id: event.clubId, name: event.clubName, logo: event.clubLogo }, ...(event.coHostClubs ?? [])]
        : [],
    [event?.clubId, event?.clubName, event?.clubLogo, event?.coHostClubs]
  );
  const idsKey = snapshot.map((h) => h.id).join(',');

  const [live, setLive] = useState<Record<string, HostClub>>(() => {
    const initial: Record<string, HostClub> = {};
    for (const h of snapshot) {
      const cached = cache.get(h.id)?.host;
      if (cached) initial[h.id] = cached;
    }
    return initial;
  });

  useEffect(() => {
    if (snapshot.length === 0) return;
    let cancelled = false;
    const force = refreshKey > 0;
    Promise.all(snapshot.map((h) => fetchHost(h.id, force))).then((hosts) => {
      if (cancelled) return;
      const next: Record<string, HostClub> = {};
      for (const host of hosts) if (host) next[host.id] = host;
      setLive(next);
    });
    return () => {
      cancelled = true;
    };
    // idsKey covers snapshot's identity for fetching purposes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, refreshKey]);

  return useMemo<HostClub[]>(
    () =>
      snapshot.map((h) => {
        const fresh = live[h.id];
        // Keep the snapshot logo if the live club has none (or failed to load)
        return fresh
          ? { id: h.id, name: fresh.name || h.name, logo: fresh.logo || h.logo, adminIds: fresh.adminIds }
          : h;
      }),
    [snapshot, live]
  );
}
