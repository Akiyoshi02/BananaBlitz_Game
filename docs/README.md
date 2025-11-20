# 🍌 Banana Blitz

**Version 1.2.0 — Browser Puzzle & Realtime Multiplayer Game**

Banana Blitz is a single-page browser game built with HTML, CSS and vanilla JavaScript, backed by Firebase Authentication and Realtime Database. It fetches puzzles from the [Banana API](https://marcconrad.com/uob/banana/api.php) and falls back to an Unsplash banana image + generated count when the API is unavailable.

Players guess the number of bananas in each puzzle. Classic mode (lives + levels), timed difficulty, daily puzzles, realtime multiplayer rooms, friends system, and matchmaking expand replayability. You can customize your experience with avatars, themes, skins, and background music.

---
## 🎮 Gameplay Overview
- Fetch puzzle (Banana API → fallback random banana image)
- Player submits a numeric guess
- Time / streak modifiers adjust scoring
- Achievements trigger on streaks, speed, first wins, etc.
- Celebration visuals (GIFs, confetti) reinforce success

---
## 🧩 Feature Summary
| Category | Description |
|----------|-------------|
| 🖥️ UI | Responsive SPA with section toggling and accessibility support (contrast, large text, reduced motion, theme). Time-based sky themes (morning/afternoon/evening/night). |
| 🔐 Identity | Firebase Auth (email/password + Google) with custom username registry for human-readable names. Avatar system with 10 presets. |
| 🗃️ Data | Realtime Database nodes for users, sessions, multiplayer rooms/games, achievements, daily puzzles, friends, and matchmaking queue. |
| 🎚️ Mechanics | Difficulty-based timers, streak bonuses, classic lives + leveling (5 puzzles per level). Tracks highest level and tier reached. |
| 🏆 Achievements | Defined in `BananaBlitzGame.ACH`, persisted write-once under `userAchievements/{uid}`. |
| 🔊 Audio/FX | Local SFX + background music (4 tracks, skin-based), GIF celebrations (GIPHY), confetti, dynamic progress/timer bars. Music toggle and volume controls. |
| 🎨 Customization | Four visual skins (default, jungle, neon, mono) with matching music tracks. Dark/light theme toggle. FontAwesome icon integration. |
| 👥 Social | Friends system: send/accept/decline invites, remove friends, friends-only leaderboards. Matchmaking queue for quick multiplayer games. |
| 💾 Persistence | `localStorage` for theme, volumes, difficulty, skin, tutorial-seen flag, and custom avatars; Realtime Database for scores, streaks, friends, and avatars. |

### Core Firebase Paths
- `users/{uid}` — profile + aggregate stats (includes `avatar`, `highestLevel`, `highestTier`, `bananaClickCount`)
- `usernames/{key}` — unique mapping (normalized username → uid/email)
- `gameSessions/{sessionId}` — per-session metadata
- `multiplayerRooms/{code}` — live game room (host-controlled state + player subtrees + chat)
- `multiplayerGames/{gameId}` — archived results
- `matchmakingQueue/{uid}` — temporary queue entries for automatic matchmaking
- `friends/{uid}/friends/{friendId}` — bidirectional friendship records
- `friends/{uid}/friendInvites/{inviterId}` — pending friend invitations
- `dailyPuzzles/{date}` — daily puzzle definitions
- `userDaily/{uid}/{date}` — daily puzzle attempt record (write-once)
- `userAchievements/{uid}/{code}` — achievement flags (write-once)

---
## 🧭 Setup / Run (No Build Step)
1. **Clone Repo**
   ```bash
   git clone https://github.com/Akiyoshi02/BananaBlitz_Game.git
   cd BananaBlitz_Game/public
   ```
2. Open `index.html` directly in a browser OR serve with any static server.
3. Use Firebase Emulator Suite to test authentication and database rules locally.

---

**Avatar System**: Users can select from 10 preset avatars or upload custom images. Preset avatars are stored as relative paths in Firebase; custom avatars are stored in localStorage. Avatars display in profiles and leaderboards.

**Profile Stats**: Tracks highest level reached, highest tier achieved (e.g., "Legendary"), and banana click count for additional engagement metrics.

---
## 🎨 Customization Features

### Themes & Skins
- **Dark/Light Theme**: Toggle between light and dark modes with persistent localStorage preference
- **Time-based Sky Themes**: Dynamic background themes that change based on time of day (morning, afternoon, evening, night)
- **Visual Skins**: Four themed skins available:
  - `default`: Default theme
  - `skin-jungle`: Jungle Adventure theme
  - `skin-neon`: Neon Nights theme  
  - `skin-mono`: Monochromatic theme
- Each skin applies custom styling and automatically switches to a matching background music track

### Audio System
- **Background Music**: Four music tracks that change based on selected skin (or default yellow theme)
- **Music Controls**: Toggle music on/off, adjust volume (0-100%), persistent settings
- **Sound Effects**: Click, correct, wrong, level up, and monkey sounds with independent volume control
- **Auto-play Handling**: Respects browser autoplay policies with gesture-based activation

## 👥 Social Features

### Friends System
- **Friend Invites**: Send friend requests by username search
- **Invite Management**: Accept or decline incoming friend invitations
- **Friends Leaderboard**: View leaderboards filtered to show only friends (all-time and today)
- **Friend Removal**: Remove friends from your list (bidirectional)

### Matchmaking
- **Queue System**: Join a matchmaking queue for automatic pairing with other players
- **Quick Match**: Find multiplayer games without needing room codes
- **Queue Management**: Automatic cleanup on disconnect or timeout

## 🏆 Achievements
Stored write-once; unlocking triggers scoring adjustments and feedback toasts. Safe from re-claim due to RTDB rule constraints.

---
## 📦 Dependencies & Assets

### External Libraries
- **Tailwind CSS**: Utility-first CSS framework (CDN)
- **FontAwesome**: Icon library for UI elements (`assets/fontawesome/`)
- **Firebase SDK v9.22.0**: Authentication and Realtime Database (compat mode)

### Audio Assets
- **Music Tracks**: 4 background music files (default yellow, jungle adventure, neon nights, monochromatic)
- **Sound Effects**: Click, correct, wrong, level up, monkey sound

### Image Assets
- **Avatars**: 10 preset avatar images (`assets/images/avatars/`)
- **Game Assets**: Logo, banana, monkey images
- **Fallback**: Unsplash API for puzzle images when Banana API unavailable

---

_Updated: 2025-11-20_