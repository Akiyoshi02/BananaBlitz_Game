# 🍌 Banana Blitz

**Version 1.0.0 — Full Stack Puzzle Game**

Banana Blitz is a browser-based mini-game built with an HTML + CSS + JavaScript + Node.JS + Firebase (Auth + Realtime DB) backend and use of the Banana API.
Players guess the number of bananas shown in random images and earn points for correct answers — the faster the guess, the higher the score can earn!
The project follows proper version control, event-driven programming, interoperability and virtual identity practices.

---

## 🎮 Gameplay Overview
- A random banana puzzle image is fetched from the public [Banana API](https://marcconrad.com/uob/banana/api.php).
- The player enters a number guess.
- Correct guesses add points to the leaderboard.
- Difficulty modes and a timer make the game more challenging.
- Celebration animations and sound effects with music enhance player feedback.

---

## 🧩 Features
| Category | Description |
|-----------|-------------|
| 🖥️ **Frontend** | Responsive interface built with HTML, CSS, and JS. Includes dark/light mode toggle, sound effects, celebration GIFs, confetti, and live timer bar. |
| ⚙️ **Backend (Auth + Realtime DB)** | Handles user registration, login, score tracking, leaderboard queries, and integration with external APIs (Banana API & Giphy API). |
| 🎚️ **Game Mechanics** | Dynamic scoring system with time-based bonus points and two difficulty levels. |
| 🔊 **Sound & Visual FX** | Click, success, fail and background music sounds stored in `/assets`; confetti and score-popup animations. |
| 🌗 **Dark Mode Support** | Automatically saves user preference using `localStorage`. |
| 🧠 **Session Persistence** | Sessions store logged-in users and puzzle states. |

---

## 🧭 Setup Instructions

### Prerequisites
- Any modern browser (Chrome, Edge, Firefox)

### Steps
1. **Clone Repo**
   ```bash
   git clone https://github.com/Akiyoshi02/BananaBlitz_Game.git