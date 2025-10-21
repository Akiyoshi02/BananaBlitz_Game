# Security Notes

This is a student project. The client currently calculates scores and posts them to Firebase Realtime Database (RTDB).
We enforce *reasonable* bounds and monotonic counters in RTDB rules, but a determined client could still spoof values.

## Current mitigations
- RTDB **validation rules** cap values (e.g., points, solveTime) and guard ownership writes.
- All important timestamps (createdAt, lastLogin, session timestamps) use **ServerValue.TIMESTAMP**.
- **Username registry** (`/usernames`) prevents collisions; owner-only deletion and claim-once semantics.
- **Achievements** use a write-once flag in `/userAchievements` to prevent re-claiming.

## Planned / Future hardening
- Move scoring into **Cloud Functions**:
  - Validate the Banana API solution server-side per round.
  - Issue server-signed results and update totals in privileged context.
- Use **custom tokens** or callable functions for sensitive updates.
- Replace client-side increments with **atomic transactions** everywhere (partially implemented).
- Add **rate limiting** on guess submissions per user/IP.
