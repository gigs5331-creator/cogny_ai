# Offline-first Cogni

## Goal
Make Cogni installable and usable without internet after a student has opened it online once. Students can study downloaded decks, answer questions, keep progress, and prepare document uploads while offline. Network-dependent work syncs automatically when connectivity returns.

## User experience
- Add an installable app manifest, Cogni icons, theme metadata, and standalone display support.
- Cache the app shell and previously visited routes so the published app opens without internet.
- Show a small, clear offline/sync status in the app header.
- Add an explicit **Available offline** action for decks and indicate which decks are downloaded.
- Provide an offline dashboard from locally saved deck summaries and cards rather than showing an endless loader or error.
- Keep multiple-choice, study cards, formulas, diagrams, answer reveal, and quiz resume fully usable offline.
- Save answers, card status changes, and study progress locally while offline; sync each queued change once online without double-counting.
- Allow documents to be selected and parsed offline. Save the extracted source and creation settings as a pending job; automatically start AI generation and cloud saving after reconnection.
- Explain in the creation screen that AI generation itself requires a connection. Chat, leaderboard, shared-deck search, notifications, and WhatsApp launching remain online-only and will show an appropriate offline state.

## Technical implementation
- Add `vite-plugin-pwa` using `generateSW`, `registerType: "autoUpdate"`, `injectRegister: null`, and `devOptions.enabled: false`.
- Register through one guarded wrapper only in production. Never register in development, iframe/Lovable preview hosts, or with `?sw=off`; unregister stale matching app workers in those contexts.
- Use `NetworkFirst` for HTML/navigation, exclude OAuth paths, and use `CacheFirst` only for same-origin hashed assets. Cache local fonts so the installed app does not depend on Google Fonts.
- Add an IndexedDB storage layer for deck/card snapshots, pending document-generation jobs, answer events, card-status changes, and sync metadata.
- Give queued mutations stable client-generated IDs and mark them synced only after a successful database write, preventing duplicate leaderboard entries after retries.
- Update deck loading to prefer fresh cloud data online, persist successful reads, and fall back to IndexedDB offline.
- Update dashboard loading to cache successful personal-library/stat reads and render the offline subset when disconnected. Network-only community sections will be disabled with concise status text.
- Update create flow to persist parsed input locally before any AI request, resume pending jobs on reconnect, and retain failed jobs for manual retry.
- Preserve existing authentication boundaries: a previously signed-in student can use downloaded private content offline on that device; first sign-in, sign-up, and account switching require internet.

## Validation
- Verify install metadata and service-worker behavior in a production build, not the Lovable preview.
- Test at desktop and mobile sizes: open online, download a deck, disconnect, reload directly on the deck URL, answer questions, close/reopen, reconnect, and confirm one-time progress sync.
- Test an offline document upload: parse and queue it, reconnect, generate all cards, split large results into parts, and save normally.
- Confirm OAuth is never cached, preview has no active app-shell worker, vertical scrolling still works, and no stale-cache reload loop is introduced.

## Scope note
AI generation and semantic AI grading cannot execute without internet because their model runs securely on the server. Offline typed-answer study will reveal the model answer for self-review or use a conservative local exact-match check; full AI grading is queued/retried online.