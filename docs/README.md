# 🍌 Banana Blitz

**Version 1.3.0 - Browser Puzzle & Realtime Multiplayer Game**

Banana Blitz is a single-page browser game built with HTML, CSS and vanilla JavaScript, backed by Firebase Authentication and Realtime Database. It fetches puzzles from the [Banana API](https://marcconrad.com/uob/banana/api.php) and falls back to an Unsplash banana image + generated count when the API is unavailable.

Players guess the number of bananas in each puzzle. Classic mode (lives + levels), timed difficulty, daily puzzles, realtime multiplayer rooms, friends system, and matchmaking expand replayability. You can customize your experience with avatars, themes, skins, and background music.

[![Play on GitHub Pages](https://img.shields.io/badge/Play%20Now-GitHub%20Pages-orange?style=for-the-badge&logo=github)](https://akiyoshi02.github.io/BananaBlitz_Game/)

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

---

## 📸 Screenshots  

### 🔐 Login  
![Login UI](https://github.com/user-attachments/assets/d496a281-1b30-4c97-b8af-c6a3b53e33e3)

![Account Recovery UI](https://github.com/user-attachments/assets/6599306b-40dc-4ed3-b17f-dc0991d1946b)

### 📝 Registration  
![Registration UI](https://github.com/user-attachments/assets/20bbf04f-2bcc-448a-9f95-099d7a797f44)

### 🏠 Main Menu  
![Main Menu UI](https://github.com/user-attachments/assets/99610b12-e69a-47fa-a512-2027bd336ec9)

### 🎮 Classic Mode  
![Classic Mode UI](https://github.com/user-attachments/assets/43c345c5-9725-4f64-96c2-f88a3c7c85b3)

![Celebration  UI](https://github.com/user-attachments/assets/d672e8a3-6c4a-4fb7-a1d5-e5bef28f3acb)

### 👥 Multiplayer Mode  
![Multiplayer Mode UI](https://github.com/user-attachments/assets/29bb66e3-650a-4b10-aa94-474672da30b2)

![Waiting Room UI](https://github.com/user-attachments/assets/1d26d710-caf8-4862-944c-d76ef1823017)

![Chat Room UI](https://github.com/user-attachments/assets/3ebe0f61-c958-4aa1-8fc2-b019bf774afe)

### 📆 Daily Challenge Mode  
![Daily Challenge UI](https://github.com/user-attachments/assets/f99f2a4a-841b-4d31-a04a-22037937ed89)

### 👤 User Profile UI  
![User Profile UI](https://github.com/user-attachments/assets/aa0a77e5-8be9-493b-896b-8550d0c575a5)

### 🏆 Leaderboard UI  
![Leaderboard UI](https://github.com/user-attachments/assets/23273a24-a662-49dd-bce4-909c6c7db86d)

### ⚙️ Settings UI
![Settings UI](https://github.com/user-attachments/assets/7a733cf7-4dba-4d79-bac5-2eb1b9c4731d)

![Default Theme UI](https://github.com/user-attachments/assets/4bbafbab-15ba-496e-a75e-b3aecf595744)

![Default Theme UI](https://github.com/user-attachments/assets/66f7d501-c73b-4b0f-b4d8-80698284ac93)

![Neon Night Theme UI](https://github.com/user-attachments/assets/75f55380-74df-41fb-968b-e60689864ab2)

![Monochromatic Theme UI](https://github.com/user-attachments/assets/3e6ae96c-2af7-44ab-af81-7cc2cea3d6d9)

### 💤 Screensaver UI  
![Screensaver UI](https://github.com/user-attachments/assets/5d57a8a2-c100-4b40-804e-4be420265c4f)

_Based on the time of the day, the screensaver theme will change depending on it._

---
## 🧭 Setup / Run (No Build Step)
1. **Clone Repo**
   ```bash
   git clone https://github.com/Akiyoshi02/BananaBlitz_Game.git
   cd BananaBlitz_Game/public
   ```
2. **Configure API Keys** (Optional but recommended)
   - Copy `firebase/api-keys-config.example.js` to `firebase/api-keys-config.js`
   - Replace `YOUR_GIPHY_API_KEY_HERE` with your GIPHY API key from https://developers.giphy.com/
3. Open `index.html` directly in a browser OR serve with any static server.
4. (Optional) Use Firebase Emulator Suite to test authentication and database rules locally.

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
