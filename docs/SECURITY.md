# Security Notes

⚠️ This is a student project and **not intended for production use**. Scoring and most state updates are currently client-driven and persisted in Firebase Realtime Database (RTDB). Validation rules and ownership checks reduce casual abuse, but a determined attacker can still manipulate requests from the browser console or a custom client.

---

## Data Surface

| Area       | Path(s)                                                                 | Notes |
|-----------|-------------------------------------------------------------------------|-------|
| Profiles  | `users/{uid}`                                                          | Bounded numeric stats (e.g. `totalScore`, `bestStreak`, `highestLevel`, `bananaClickCount`) with upper limits. Avatar URLs limited to 512 chars. |
| Usernames | `usernames/{key}`                                                      | Claimed via transactional write; prevents collisions and basic account hijacking. |
| Sessions  | `gameSessions/{id}`                                                    | Per-session summary with capped `points`, `solveTime`, and `streak`. |
| Multiplayer | `multiplayerRooms/{code}`                                            | Host-only mutations for round state; players write only their own subtree. Chat messages limited to 300 chars. |
| Achievements | `userAchievements/{uid}/{code}`                                     | Write-once boolean flags; cannot be toggled repeatedly. |
| Daily     | `dailyPuzzles/{date}`, `userDaily/{uid}/{date}`                        | Admin-only creation of daily puzzles; single-attempt user writes. |
| Friends   | `friends/{uid}/friends/{friendId}`, `friends/{uid}/friendInvites/{inviterId}` | Bidirectional friendship records. Invites expire after 5 minutes (timestamp validation). Username in invites limited to 50 chars. |
| Matchmaking | `matchmakingQueue/{uid}`                                             | Temporary queue entries with timestamp validation. Auto-cleanup on disconnect. |

---

## Current Mitigations

- RTDB validation rules cap values (e.g. `points ≤ 1000`/round, `solveTime ≤ 600s`, `streak ≤ 999`) to prevent runaway counters.
- Ownership checks ensure users can only mutate their own profile and player subtree.
- All critical timestamps use server-generated values (e.g. `ServerValue.TIMESTAMP`) to avoid client clock tampering.
- Username registry is claim-once; the change workflow atomically remaps `old → new` and deletes the obsolete key.
- Achievements use write-once semantics; replay attacks yield no additional points.
- Transactions are used where race-safety is needed (`multiplayerRooms` tokens, score increments, username claims), reducing lost updates.

---

## Known Gaps / Risks

- **Client-side scoring**: All score calculations happen on the client; a modified client can post inflated `points` within allowed caps, degrading leaderboard integrity.
- **No rate limiting** on guess submissions or chat messages beyond rule validation.
- **No server-side puzzle verification**: The server does not verify that guesses correspond to a legitimate puzzle; an attacker could inject answers after viewing the solution.
- **No anti-replay signature** for multiplayer final scores; results can be re-submitted or tampered with by a custom client.
- **Chat moderation** is absent (any text is allowed within length constraints).
- **Avatar System**: Custom avatars are stored in `localStorage` only (not synced to Firebase). Preset avatars use relative paths that could be manipulated if inputs are not validated. No image validation or size limits enforced client-side.
- **Friends System**: Username search could be abused for enumeration. No rate limiting on friend invite sends. Friend removal is bidirectional but lacks a confirmation step.
- **Matchmaking**: Queue entries can be created/removed freely; no rate limiting on queue joins. Potential for queue flooding or “queue griefing”.
- **Theme/Skin Settings**: Stored in `localStorage` only; no security risk, but settings do not sync across devices.

---

## Planned / Future Hardening

1. **Authoritative Scoring**  
   Move scoring and puzzle validation into Cloud Functions (or another trusted backend). The client sends raw guess + timing; the server computes and writes scores.

2. **Round Tokens / Signatures**  
   Introduce server-signed round tokens (e.g. HMAC) to validate legitimate progression and prevent forged score submissions.

3. **Rate Limiting**  
   Implement rate limiting (e.g. via callable Functions or aggregate counters) on:
   - Guess submissions  
   - Chat messages  
   - Friend invites  
   - Matchmaking queue joins  

4. **Stronger Atomic Updates**  
   Enforce stricter per-session atomic updates to reduce multi-path optimistic updates and partial writes.

5. **Chat Moderation**  
   Add a simple profanity filter and normalization on chat input before writes.

6. **Centralized Critical Writes**  
   Migrate critical updates (achievements, streak updates, final scores) to callable Functions to centralize validation.

7. **Avatar Security**  
   - Migrate custom avatars to Firebase Storage with image validation (format, file size, dimensions).
   - Add virus/malware scanning for uploaded files (where possible).
   - Enforce strict whitelisting of preset avatar paths.

8. **Friends System Hardening**  
   - Add rate limiting on friend invite sends (e.g. max N invites per hour).  
   - Implement pagination / limited result sets for username search to reduce enumeration.

9. **Matchmaking Controls**  
   - Add cooldowns on queue joins.  
   - Enforce queue size limits and automatic cleanup of stale entries (TTL-based in rules).

10. **Settings Sync**  
    Consider migrating theme/skin preferences and other UX settings to Firebase for cross-device sync (with appropriate privacy considerations).

---

## Guidance for Contributors

- Keep `firebase-rules.json` caps aligned with client-side calculation logic; never increase client-side limits without updating rules.
- Prefer `transaction()` for increments (streak, scores) to avoid lost updates under contention.
- Never trust client-reported totals when adding analytics or new features; recompute server-side or rely on append-only logs.
- Keep username normalization consistent with the `toKeyUsername()` implementation used on both client and rules.
- **Avatar URLs**  
  - Validate that avatar paths are either known-relative paths (`assets/images/avatars/...`) or safe data URLs for custom uploads.  
  - Enforce the 512-character limit in both client and rules.

- **Friends**  
  - Always maintain bidirectional updates for friend relationships.  
  - Validate that invite timestamps are within the acceptable window (5 minutes) before accepting.

- **Matchmaking**  
  - Ensure queue cleanup is triggered on disconnect and via TTLs in rules where possible.

- **Chat**  
  - Enforce the 300-character limit client-side and server-side.  
  - If profanity filtering is added, perform checks before writes and avoid storing rejected content.

---

_Updated: 2025-11-20_
