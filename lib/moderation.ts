// lib/moderation.ts — in-app reporting and user blocking.
//
// Google Play requires both of these for any app carrying user-generated
// content: an in-app path to report objectionable content, and a way to block
// another user. The Child Safety Standards declaration additionally requires
// that reporting a child-safety concern is reachable in-app, which is why
// 'child_safety' leads REPORT_REASONS rather than sitting under "other".
//
// Reports are write-only from the client — they land in `reports` where only
// the console/admin tooling reads them. Blocks live on the blocker's own user
// doc so feed filtering costs no extra read.

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type ReportContentType = 'event' | 'club' | 'user' | 'storeItem';

export interface ReportReason {
  id: string;
  label: string;
  description: string;
  /** Routed for immediate review rather than the normal queue. */
  urgent?: boolean;
}

export const REPORT_REASONS: ReportReason[] = [
  {
    id: 'child_safety',
    label: 'Child safety',
    description: 'Sexualizes, endangers, or exploits a minor',
    urgent: true,
  },
  {
    id: 'harassment',
    label: 'Harassment or bullying',
    description: 'Targets someone with abuse or threats',
  },
  {
    id: 'hate_speech',
    label: 'Hate speech',
    description: 'Attacks a protected group',
  },
  {
    id: 'violence',
    label: 'Violence or dangerous acts',
    description: 'Threatens harm or promotes dangerous activity',
    urgent: true,
  },
  {
    id: 'sexual_content',
    label: 'Sexual content',
    description: 'Explicit or adult material',
  },
  {
    id: 'scam',
    label: 'Scam or fraud',
    description: 'Fake event, deceptive pricing, or payment fraud',
  },
  {
    id: 'spam',
    label: 'Spam or misleading',
    description: 'Repetitive, off-topic, or impersonating someone',
  },
  {
    id: 'other',
    label: 'Something else',
    description: "Doesn't fit the categories above",
  },
];

export interface SubmitReportParams {
  contentType: ReportContentType;
  /** Document id of the reported event / club / user / store item. */
  contentId: string;
  /** uid of whoever owns the reported content, when known. */
  contentOwnerId?: string;
  /** Human-readable label so a reviewer doesn't have to look the doc up. */
  contentLabel?: string;
  reasonId: string;
  details?: string;
}

/**
 * File a report. Always resolves — a moderation path that throws is a
 * moderation path users abandon, so failures come back as { success: false }
 * for the caller to surface.
 */
export const submitReport = async (
  params: SubmitReportParams
): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'You must be signed in to report content.' };
    }

    const reason = REPORT_REASONS.find((r) => r.id === params.reasonId);

    await addDoc(collection(db, 'reports'), {
      contentType: params.contentType,
      contentId: params.contentId,
      contentOwnerId: params.contentOwnerId ?? null,
      contentLabel: params.contentLabel ?? null,
      reasonId: params.reasonId,
      reasonLabel: reason?.label ?? params.reasonId,
      urgent: reason?.urgent ?? false,
      details: params.details?.trim() ? params.details.trim().slice(0, 2000) : null,
      reportedBy: user.uid,
      status: 'open',
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Could not submit report.' };
  }
};

/**
 * Block a user. Their events and clubs stop appearing in the blocker's feeds
 * (filtering happens in getAllEvents / getClubs) and the block is visible only
 * to the blocker — the blocked user is never notified.
 */
export const blockUser = async (
  blockedUserId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'You must be signed in to block someone.' };
    }
    if (user.uid === blockedUserId) {
      return { success: false, error: "You can't block yourself." };
    }

    await updateDoc(doc(db, 'users', user.uid), {
      blockedUsers: arrayUnion(blockedUserId),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Could not block this user.' };
  }
};

export const unblockUser = async (
  blockedUserId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'You must be signed in.' };
    }

    await updateDoc(doc(db, 'users', user.uid), {
      blockedUsers: arrayRemove(blockedUserId),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Could not unblock this user.' };
  }
};

/**
 * uids the signed-in user has blocked. Returns [] rather than throwing when
 * signed out or on read failure — callers use this to filter feeds, and a
 * failed read should degrade to "show everything", not an empty screen.
 */
export const getBlockedUserIds = async (): Promise<string[]> => {
  try {
    const user = auth.currentUser;
    if (!user) return [];

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return [];

    const blocked = snap.data()?.blockedUsers;
    return Array.isArray(blocked) ? blocked : [];
  } catch {
    return [];
  }
};
