// hooks/useIsStaff.ts
// Whether the signed-in account carries the `staff` custom claim — the same
// signal isRallysphereStaff enforces server-side.
//
// Read from the ID token rather than a Firestore flag deliberately: the claim is
// what the server actually trusts, so anything else could disagree with it and
// show a "SANDBOX" banner to someone the server is routing to live.
//
// Note this can't be a plain synchronous read of auth.currentUser — claims live
// inside the ID token and getIdTokenResult() is async. The old code checked
// auth.currentUser.email, which is always null here because RallySphere signs in
// by phone.
import { useEffect, useState } from 'react';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

export function useIsStaff(): boolean {
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const read = async (user: any, force: boolean) => {
      if (!user) {
        if (!cancelled) setIsStaff(false);
        return;
      }
      try {
        // force=true on the first read: getIdTokenResult() otherwise returns the
        // CACHED token, which can be up to an hour old and won't contain a claim
        // granted after it was issued. Without this, newly-granted staff appear
        // non-staff until the token happens to rotate — indistinguishable from
        // the claim not being set at all.
        const res = await user.getIdTokenResult(force);
        if (!cancelled) setIsStaff(res?.claims?.staff === true);
      } catch {
        if (!cancelled) setIsStaff(false);
      }
    };

    // Force a refresh on sign-in so a freshly granted claim is picked up without
    // a re-login; read from cache on subsequent token changes to avoid a network
    // round-trip on every rotation.
    const unsubAuth = onAuthStateChanged(auth, (u) => read(u, true));
    const unsubToken = onIdTokenChanged(auth, (u) => read(u, false));

    // Covers the case where auth is already settled before this mounts, so
    // neither listener fires with a user.
    if (auth.currentUser) read(auth.currentUser, true);

    return () => {
      cancelled = true;
      unsubAuth();
      unsubToken();
    };
  }, []);

  return isStaff;
}
