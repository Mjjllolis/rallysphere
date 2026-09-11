# Release Process — TODO

Setting up `master` / `staging` / `dev` with GitHub Actions. `master` stays the main (production) branch.

## Decisions (locked)

- **One app per store.** Staging builds use the same bundle ID (`com.rallysphere.app`). Installing the TestFlight / Play Internal build **replaces** the store app on a tester's phone — no side-by-side "RallySphere Staging" app.
- **Shared backend.** Staging builds hit the prod Firebase project (`rally-sphere`) and live Finix. Backend changes must be deployed first and stay backwards-compatible with the current store build.
- **Ship the build you tested.** Production = promoting the exact TestFlight / Play Internal build. No rebuild on `master`.
- **CI = GitHub Actions** (repo is public → unlimited minutes + free environment approvals).

## Branch flow

```
feature/xyz (off master) ──PR──► dev ──PR──► staging ──PR──► master
                                              │                │
                               TestFlight + Play Internal   tag vX.Y.Z,
                                                           promote same build
```

- Only merge **finished** work into `dev` — everything in `dev` moves to `staging` together.
- Hotfix: `hotfix/xyz` off `master` → build it via the staging workflow's manual "Run workflow" button → PR into `master` → merge `master` back into `staging` and `dev`.

---

## 1. Accounts & secrets (you)

- [ ] **EXPO_TOKEN** — expo.dev → Account settings → Access tokens → create → `gh secret set EXPO_TOKEN`
- [ ] **Firebase deploy service account** — GCP console (`rally-sphere`) → IAM → Service accounts → create `github-deploy`. Start with **Firebase Admin** + **Service Account User**; add **Cloud Functions Admin** / **Cloud Run Admin** if the first deploy fails on permissions. Create a JSON key → `gh secret set FIREBASE_SERVICE_ACCOUNT < key.json` → delete the local key file.
- [ ] **Apple submit key on EAS** — CI can't do the interactive Apple ID login. `eas credentials` → iOS → **App Store Connect API Key** → add one (App Store Connect → Users and Access → Integrations → Keys, role App Manager).
- [ ] **Play submit key on EAS** — `service-account-key.json` is gitignored so CI won't have it. `eas credentials` → Android → **Google Service Account Key** → upload it.
- [ ] **GitHub environment** — repo Settings → Environments → new `production-backend` → Required reviewers: you.

## 2. Repo changes (Claude can do these on `chore/ci-pipelines`)

- [ ] `eas.json` — `"appVersionSource": "remote"` (stops build-number merge conflicts between branches)
- [ ] `eas.json` — add `staging` build profile (same as `production`)
- [ ] `eas.json` — add `staging` submit profile: iOS → TestFlight, Android → `"track": "internal"`, `"releaseStatus": "completed"`; no `serviceAccountKeyPath` (uses the EAS-stored key)
- [ ] `.github/workflows/pr-check.yml` — on PRs into `dev` / `staging` / `master`: `npm ci`, functions build (**blocking**), app `tsc --noEmit` (**non-blocking** until the errors below are fixed)
- [ ] `.github/workflows/staging-release.yml` — on push to `staging` + manual trigger:
  - backend job (`production-backend` environment → needs your approval): `firebase deploy --only functions,firestore,storage`; skipped when `functions/`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` didn't change
  - app job: `eas build --profile staging --platform all --auto-submit --non-interactive --no-wait`
  - Hosting stays manual (`firebase deploy --only hosting`)
- [ ] `.github/workflows/release-tag.yml` — on push to `master`: tag `v<expo.version>`
- [ ] Settings screen — show `version (build)` so testers know which build they're on

## 3. One-time setup after the repo changes (you)

- [ ] Confirm the latest uploaded build numbers in App Store Connect / Play Console, then seed remote versioning: `eas build:version:set -p ios` and `eas build:version:set -p android` (app.json currently says iOS `63`, Android `15`)
- [ ] Create branches: `git checkout master && git checkout -b dev && git push -u origin dev`, then same for `staging`
- [ ] Branch protection (Settings → Branches) on `master` and `staging`: require PR, require the PR check to pass, block force-push
- [ ] Do one dry-run: tiny PR `dev` → `staging`, approve backend job, confirm builds land in TestFlight + Play Internal

## 4. Tester setup (you)

- [ ] **TestFlight internal group** — App Store Connect → TestFlight → Internal Testing → add team members (up to 100, no review, auto-distribute new builds)
- [ ] **TestFlight external group** (outside users) — add group + enable **Public Link**. First build of each version needs Beta App Review (usually < 1 day).
- [ ] **Play Internal testing** — Play Console → Testing → Internal testing → Testers → create email list → share the **opt-in link**
- [ ] Tell Android testers: to go back to the Play Store version they must leave via the opt-in link **and uninstall/reinstall** (Android can't downgrade)

## 5. Cleanup

- [ ] Fix the **101 app TypeScript errors** (biggest: `lib/firebase.ts` 18, `app/` screens, `components/GlassDateTimePicker.tsx` 10) → flip app `tsc` in `pr-check.yml` to blocking
- [ ] Update `scripts/release.sh` / README to point at the new flow (keep `npm run release` as a manual fallback)
- [ ] Decide whether the repo should stay **public** (payments code, rules, Finix cert doc, admin scripts are visible). Going private: Actions still free (2,000 min/mo) but environment approvals need GitHub Pro (~$4/mo).

---

## Every release (checklist)

1. [ ] Feature branches off `master` → PRs into `dev`
2. [ ] Start of cycle: bump `expo.version` in `app.json` on `dev` (e.g. `1.0.1` → `1.0.2`) — Apple won't take new builds for an already-released version
3. [ ] PR `dev` → `staging` → merge
4. [ ] Approve the backend deploy in Actions (if it runs) — **this deploys to prod**
5. [ ] Wait for EAS build → lands in TestFlight + Play Internal
6. [ ] Testers test. Fixes go through `dev` → `staging` again (new build)
7. [ ] Sign-off → PR `staging` → `master` → merge (auto-tags `vX.Y.Z`)
8. [ ] **iOS:** App Store Connect → the version → pick the tested build → Submit for Review
9. [ ] **Android:** Play Console → Internal testing → **Promote release** → Production
