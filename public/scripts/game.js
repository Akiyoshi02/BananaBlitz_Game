class BananaBlitzGame {
  constructor() {
    this.gameMode = 'classic';
    this.dailyPageNum = 1;
    this.lastLbRows = [];

    this.usernameGlobal = null;
    this.difficulty = localStorage.getItem('difficulty') || 'easy';
    this.timerInterval = null;
    this.timeRemaining = 0;
    this.paused = false;
    this.hintUsed = false;

    this.streak = 0;
    this.dailyStreak = 0;

    this.bestStreak = 0;
    this.fastestSolve = 0;
    this.sessionPoints = 0;
    this.lastGuessTs = 0;

    this.sessionAttempts = 0;
    this.sessionCorrect = 0;

    this.loaderStart = performance.now();
    this.LOADER_MIN_MS = 1600;

    this.SKINS = ['skin-jungle', 'skin-neon', 'skin-mono'];
    this.currentSkin = localStorage.getItem('skin') || '';
    if (this.currentSkin) document.body.classList.add(this.currentSkin);

    this.sounds = {
      click: new Audio('assets/audio/sfx/click.wav'),
      correct: new Audio('assets/audio/sfx/correct.mp3'),
      wrong: new Audio('assets/audio/sfx/wrong.wav'),
      bgm: new Audio('assets/audio/music/music.mp3')
    };

    this.sounds.bgm.loop = true;

    this._bgmTriedAutoplay = false;
    this._bgmIsPlaying = false;

    this._volumeCueBucket = null;
    this._volumeCueCooldown = false;

    const savedVol = localStorage.getItem('sfxVolume');
    const vol = savedVol ? Math.max(0, Math.min(100, parseInt(savedVol, 10))) : 40;
    Object.values(this.sounds).forEach(s => s.volume = vol / 100);
    this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
    this.sfxVolume = vol;

    const savedMusicVol = localStorage.getItem('musicVolume');
    this.musicVolume = savedMusicVol ? Math.max(0, Math.min(100, parseInt(savedMusicVol, 10))) : 45;

    Object.values(this.sounds).forEach(s => {
      if (s !== this.sounds.bgm) s.volume = this.sfxVolume / 100;
    });
    this.sounds.bgm.volume = Math.min(1, (this.musicVolume || 0) / 100);

    this.musicEnabled = localStorage.getItem('musicEnabled') !== 'false';

    this.multiplayerMode = false;
    this.currentRoom = null;
    this.roomPlayers = [];
    this.gameStarted = false;
    this.playerReady = false;

    this.maxLives = 3;
    this.lives = this.maxLives;
    this.sessionDuration = 120;
    this.sessionTimeRemaining = 0;
    this.sessionTimerInterval = null;

    this.ACH = {
      STREAK_5: { name: 'Hot Streak', points: 50, description: 'Achieve a streak of 5 correct answers' },
      SPEED_5: { name: 'Speed Demon', points: 30, description: 'Solve a puzzle in under 5 seconds' },
      PERFECT_GUESS: { name: 'Banana Master', points: 25, description: 'Guess the exact number of bananas' },
      FIRST_WIN: { name: 'First Blood', points: 10, description: 'Win your first game' },
      MULTIPLAYER_WIN: { name: 'Team Player', points: 40, description: 'Win a multiplayer game' },
      STREAK_10: { name: 'Epic Streak', points: 100, description: 'Achieve a streak of 10 correct answers' },
      DAILY_STREAK_7: { name: 'Week Warrior', points: 150, description: 'Maintain a 7-day daily streak' },
      FIRST_DAILY: { name: 'Daily Debut', points: 15, description: 'Complete your first daily challenge' },
      CHANGE_SKIN: { name: 'Stylist', points: 5, description: 'Change your game skin' },
      TOGGLE_THEME: { name: 'Night Owl', points: 5, description: 'Toggle the theme mode' },
      GAMES_WON_50: { name: 'Veteran Solver', points: 120, description: 'Win 50 games' }
    };

    try {
      this.auth = window.firebaseAuth;
      this.db = window.firebaseDb;
      if (!this.auth || !this.db) {
        throw new Error('Missing shared Firebase instances');
      }
      console.log('Firebase services (Auth + Realtime DB) ready');
    } catch (error) {
      console.error('Firebase services unavailable, enabling mock services:', error);
      this.createMockFirebaseServices();
    }

    this.authManager = new AuthManager(this);
    this.leaderboardManager = new LeaderboardManager(this);
    this.multiplayerManager = new MultiplayerManager(this);
    this.friendsManager = new FriendsManager(this);

    this.init();
  }

  createMockFirebaseServices() {
    console.warn('Using mock Firebase services - some features may be limited');
    this.auth = {
      currentUser: null,
      onAuthStateChanged: (callback) => {
        setTimeout(() => callback(this.auth.currentUser), 100);
        return () => { };
      },
      signInWithEmailAndPassword: async (email, password) => {
        this.auth.currentUser = {
          uid: 'demo-user-' + Date.now(),
          email: email,
          displayName: email.split('@')[0]
        };
        return { user: this.auth.currentUser };
      },
      createUserWithEmailAndPassword: async (email, password) => {
        this.auth.currentUser = {
          uid: 'demo-user-' + Date.now(),
          email: email,
          displayName: email.split('@')[0]
        };
        return { user: this.auth.currentUser };
      },
      signOut: async () => {
        this.auth.currentUser = null;
        return Promise.resolve();
      }
    };

    this.db = {
      ref: (path) => ({
        set: (data) => {
          console.log('Mock DB: Setting data', path, data);
          localStorage.setItem(`mock_db_${path}`, JSON.stringify(data));
          return Promise.resolve();
        },
        update: (data) => {
          console.log('Mock DB: Updating data', path, data);
          const existing = JSON.parse(localStorage.getItem(`mock_db_${path}`) || '{}');
          localStorage.setItem(`mock_db_${path}`, JSON.stringify({ ...existing, ...data }));
          return Promise.resolve();
        },
        remove: () => {
          console.log('Mock DB: Removing data', path);
          localStorage.removeItem(`mock_db_${path}`);
          return Promise.resolve();
        },
        on: (event, callback) => {
          console.log('Mock DB: Listening to', event, 'on', path);
          if (event === 'value') {
            const data = JSON.parse(localStorage.getItem(`mock_db_${path}`) || 'null');
            setTimeout(() => callback({ val: () => data }), 100);
          }
          return () => { };
        },
        once: (event) => {
          console.log('Mock DB: Once listening to', event, 'on', path);
          const data = JSON.parse(localStorage.getItem(`mock_db_${path}`) || 'null');
          return Promise.resolve({ val: () => data });
        },
        child: (childPath) => this.db.ref(path + '/' + childPath)
      })
    };

    setTimeout(() => {
      this.auth.currentUser = {
        uid: 'demo-user',
        email: 'demo@bananablitz.com',
        displayName: 'Demo Player'
      };
      this.usernameGlobal = 'Demo Player';
    }, 1000);
  }

  init() {
    this.setupEventListeners();
    this.applySavedSettings();
    this.preloadAssets();
    this.wireGameOverModalButtons();
    this.initCelebrations();
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      const key = (typeof e.key === 'string') ? e.key : '';
      const t = e.target;
      const isTypingTarget =
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true);

      if (key === 'Enter') {
        const authSection = document.getElementById('authSection');
        if (authSection && !authSection.classList.contains('hidden')) {
          if (!document.getElementById('loginForm').classList.contains('hidden')) {
            this.authManager.login();
          } else {
            this.authManager.register();
          }
          return;
        }

        const gameSection = document.getElementById('gameSection');
        if (gameSection && !gameSection.classList.contains('hidden')) {
          this.submitGuess();
          return;
        }

        const dailySection = document.getElementById('dailySection');
        if (dailySection &&
          !dailySection.classList.contains('hidden') &&
          document.activeElement === document.getElementById('dailyGuess')) {
          this.submitDaily();
          return;
        }

        const mpSection = document.getElementById('multiplayerSection');
        if (mpSection &&
          !mpSection.classList.contains('hidden') &&
          document.activeElement === document.getElementById('multiplayerGuess')) {
          this.submitMultiplayerGuess();
          return;
        }
      }

      if (key.toLowerCase() === 'e' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggleSound();
        return;
      }

      if (key.toLowerCase() === 'm' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggleMusic();
        return;
      }


      if (e.key === '?' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.showTutorial(30);
        e.preventDefault();
      }

      if (key.toLowerCase() === 'h' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.getHint();
        return;
      }

      if (key.toLowerCase() === 'r' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const inGame = document.getElementById('gameSection');
        if (inGame && !inGame.classList.contains('hidden')) {
          this.showToast('Loading a new puzzle…');
          this.loadPuzzle();
        }
        return;
      }
    });

    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    document.getElementById('soundToggle')?.addEventListener('change', () => this.toggleSound());
    document.getElementById('musicToggle')?.addEventListener('change', () => this.toggleMusic());
    document.getElementById('darkToggle')?.addEventListener('change', (e) => this.setTheme(e.target.checked));
    document.getElementById('hcToggle')?.addEventListener('change', () => this.toggleHighContrast());
    document.getElementById('largeToggle')?.addEventListener('change', () => this.toggleLargeText());
    document.getElementById('rmToggle')?.addEventListener('change', () => this.toggleReducedMotion());
    document.getElementById('difficultySelect')?.addEventListener('change', () => this.changeDifficulty());
    document.getElementById('skinSelect')?.addEventListener('change', () => this.changeSkin());

    const sfx = document.getElementById('sfxVolume');
    const sfxLabel = document.getElementById('sfxVolumeValue');
    if (sfx) {
      sfx.value = this.sfxVolume;
      if (sfxLabel) sfxLabel.textContent = `${this.sfxVolume}%`;
      this._volumeCueBucket = Math.round((this.sfxVolume || 0) / 10);

      const applyVolume = (v) => {
        this.sfxVolume = v;
        localStorage.setItem('sfxVolume', String(v));
        Object.values(this.sounds).forEach(snd => { if (snd !== this.sounds.bgm) snd.volume = v / 100; });
        if (sfxLabel) sfxLabel.textContent = `${v}%`;
      };

      sfx.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, parseInt(sfx.value || '0', 10)));
        applyVolume(v);
        const bucket = Math.round(v / 10);
        if (bucket !== this._volumeCueBucket && v > 0) {
          this.playVolumeCue(v);
          this._volumeCueBucket = bucket;
        }
      });

      const releaseCue = () => {
        const v = Math.max(0, Math.min(100, parseInt(sfx.value || '0', 10)));
        if (v > 0) this.playVolumeCue(v);
      };
      sfx.addEventListener('change', releaseCue);
      sfx.addEventListener('mouseup', releaseCue);
      sfx.addEventListener('touchend', releaseCue);
    }

    const mv = document.getElementById('musicVolume');
    const mvLabel = document.getElementById('musicVolumeValue');

    if (mv) {
      mv.value = this.musicVolume;
      if (mvLabel) mvLabel.textContent = `${this.musicVolume}%`;

      const applyMusicVol = (v) => {
        this.musicVolume = v;
        localStorage.setItem('musicVolume', String(v));
        const bgm = this.sounds?.bgm;
        if (bgm) bgm.volume = Math.min(1, (v || 0) / 100);
        if (mvLabel) mvLabel.textContent = `${v}%`;
      };

      mv.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, parseInt(mv.value || '0', 10)));
        applyMusicVol(v);
      });

      mv.addEventListener('change', () => {
        const v = Math.max(0, Math.min(100, parseInt(mv.value || '0', 10)));
        applyMusicVol(v);
      });
    }

    document.addEventListener('visibilitychange', () => {
      const bgm = this.sounds?.bgm;
      if (!bgm) return;
      if (document.hidden) {
        bgm.pause();
        this._bgmIsPlaying = false;
      } else if (this.musicEnabled) {
        this._tryStartBgm();
      }
    });
  }

  showTutorial(seconds = 30) {
    const overlay = document.getElementById('tutorialOverlay');
    const skip = document.getElementById('tutorialSkip');
    const ok = document.getElementById('tutorialGotIt');
    const cd = document.getElementById('tutorialCountdown');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    let remaining = seconds;
    const tick = () => {
      if (cd) cd.textContent = `Auto closes in ${remaining}s…`;
      if (remaining <= 0) {
        this.hideTutorial(true);
        return;
      }
      remaining -= 1;
      this._tourTimer = setTimeout(tick, 1000);
    };
    tick();
    const closeNow = () => this.hideTutorial(true);
    const closeNoMark = () => this.hideTutorial(false);
    skip?.addEventListener('click', closeNow, { once: true });
    ok?.addEventListener('click', closeNow, { once: true });
  }

  hideTutorial(markSeen = true) {
    const overlay = document.getElementById('tutorialOverlay');
    if (this._tourTimer) {
      clearTimeout(this._tourTimer);
      this._tourTimer = null;
    }
    overlay?.classList.add('hidden');
    if (markSeen) localStorage.setItem('tourDone', '1');
  }

  playVolumeCue(volPercent) {
    if (!this.soundEnabled) return;
    if (this._volumeCueCooldown) return;
    this._volumeCueCooldown = true;
    setTimeout(() => (this._volumeCueCooldown = false), 180);
    try {
      const cue = new Audio('assets/audio/sfx/click.wav');
      cue.volume = Math.max(0, Math.min(1, (volPercent || 0) / 100));
      cue.currentTime = 0;
      cue.play().catch(() => { });
    } catch { }
  }

  applySavedSettings() {
    this.setTheme(localStorage.getItem('theme') === 'dark');

    if (localStorage.getItem('highContrast') === 'true') {
      document.body.classList.add('high-contrast');
      const hc = document.getElementById('hcToggle');
      if (hc) hc.checked = true;
    }

    if (localStorage.getItem('largeText') === 'true') {
      document.body.classList.add('large-text');
      const lg = document.getElementById('largeToggle');
      if (lg) lg.checked = true;
    }

    if (localStorage.getItem('reducedMotion') === 'true') {
      document.body.classList.add('reduced-motion');
      const rm = document.getElementById('rmToggle');
      if (rm) rm.checked = true;
    }

    const diff = document.getElementById('difficultySelect');
    if (diff) diff.value = this.difficulty;

    const skin = document.getElementById('skinSelect');
    if (skin) skin.value = this.currentSkin;

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) soundToggle.checked = this.soundEnabled;

    const musicToggle = document.getElementById('musicToggle');
    if (musicToggle) musicToggle.checked = this.musicEnabled;

    const mv = document.getElementById('musicVolume');
    const mvLabel = document.getElementById('musicVolumeValue');
    if (mv) mv.value = this.musicVolume;
    if (mvLabel) mvLabel.textContent = `${this.musicVolume}%`;

    if (this.musicEnabled) {
      this.safeStartMusic();
    } else {
      const bgm = this.sounds?.bgm;
      if (bgm) bgm.pause();
      this._bgmIsPlaying = false;
    }

    const sfx = document.getElementById('sfxVolume');
    const sfxLabel = document.getElementById('sfxVolumeValue');
    if (sfx) sfx.value = this.sfxVolume;
    if (sfxLabel) sfxLabel.textContent = `${this.sfxVolume}%`;
  }

  async preloadAssets() {
    const assets = [
      'assets/images/logo.png',
      'assets/audio/sfx/click.wav',
      'assets/audio/sfx/correct.mp3',
      'assets/audio/sfx/wrong.wav',
      'assets/audio/music/music.mp3'
    ];
    let loaded = 0;
    const updateLoader = () => {
      const percent = Math.round((loaded / assets.length) * 100);
      document.getElementById('loaderText').textContent = `Peeling bananas… ${percent}%`;
      document.getElementById('loaderBar').style.width = `${percent}%`;
    };
    updateLoader();
    const promises = assets.map(url => {
      return new Promise(resolve => {
        if (/\.(png|jpe?g|gif)$/i.test(url)) {
          const img = new Image();
          img.onload = img.onerror = () => {
            loaded++;
            updateLoader();
            resolve();
          };
          img.src = url;
        } else if (/\.(mp3|wav|ogg)$/i.test(url)) {
          const audio = new Audio();
          const finish = () => {
            audio.oncanplaythrough = audio.onerror = null;
            loaded++;
            updateLoader();
            resolve();
          };
          audio.oncanplaythrough = finish;
          audio.onerror = finish;
          audio.src = url;
          try { audio.load(); } catch { finish(); }
        } else {
          fetch(url).finally(() => {
            loaded++;
            updateLoader();
            resolve();
          });
        }
      });
    });
    await Promise.all(promises);
    const elapsed = performance.now() - this.loaderStart;
    const wait = Math.max(0, this.LOADER_MIN_MS - elapsed);
    setTimeout(() => {
      document.getElementById('loader').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      this._setupAutoMusicGestureOnce();
      this._tryStartBgm();
      this.authManager.showLogin();
      if (localStorage.getItem('tourDone') !== '1') {
        setTimeout(() => this.showTutorial(30), 400);
      }
    }, wait);
  }

  async _tryStartBgm() {
    if (this._bgmIsPlaying || !this.musicEnabled) return;
    const bgm = this.sounds?.bgm;
    if (!bgm) return;
    try {
      await bgm.play();
      this._bgmIsPlaying = true;
    } catch {
    }
  }

  _setupAutoMusicGestureOnce() {
    if (this._bgmTriedAutoplay) return;
    this._bgmTriedAutoplay = true;

    const kick = async () => {
      await this._tryStartBgm();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      window.removeEventListener('touchstart', kick);
    };

    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
    window.addEventListener('touchstart', kick, { once: true });
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    localStorage.setItem('musicEnabled', this.musicEnabled);

    const musicToggle = document.getElementById('musicToggle');
    if (musicToggle) musicToggle.checked = this.musicEnabled;

    if (this.musicEnabled) {
      this._tryStartBgm();
      this.showToast('🔊 Background Music ON');
    } else {
      const bgm = this.sounds?.bgm;
      if (bgm) bgm.pause();
      this._bgmIsPlaying = false;
      this.showToast('🔇 Background Music OFF');
    }
  }

  safeStartMusic() {
    if (!this.musicEnabled) return;
    this._tryStartBgm();
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    switch (type) {
      case 'success': toastIcon.textContent = '✅'; break;
      case 'error': toastIcon.textContent = '❌'; break;
      case 'warning': toastIcon.textContent = '⚠️'; break;
      default: toastIcon.textContent = 'ℹ️';
    }
    toastMessage.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, duration);
  }

  setButtonBusy(button, busy) {
    if (!button) return;

    if (button.dataset.locked === 'true') {
      button.disabled = true;
      return;
    }

    button.disabled = busy;
    if (busy) {
      button.classList.add('opacity-75', 'pointer-events-none');
      const originalText = button.textContent;
      button.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span>${originalText}`;
      button.dataset.originalText = originalText;
    } else {
      button.classList.remove('opacity-75', 'pointer-events-none');
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    }
  }


  playSound(type) {
    if (!this.soundEnabled) return;
    const sound = this.sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => { });
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('soundEnabled', this.soundEnabled);

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) soundToggle.checked = this.soundEnabled;

    this.showToast(
      this.soundEnabled ? '🔊 Sound Effects ON' : '🔇 Sound Effects OFF',
      this.soundEnabled ? 'success' : 'warning'
    );

    this.playSound('click');
  }

  isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  setTheme(isDark) {
    const root = document.documentElement;
    root.classList.toggle('dark', !!isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const chk = document.getElementById('darkToggle');
    if (chk && chk.checked !== isDark) chk.checked = isDark;

    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = isDark ? '🌙' : '🌞';

    if (typeof setThemeIcons === 'function') setThemeIcons();
  }

  toggleTheme() {
    this.setTheme(!this.isDarkMode());
    this.playSound('click');
    this.claimAchievement('TOGGLE_THEME');
  }

  toggleHighContrast() {
    const enabled = document.body.classList.toggle('high-contrast');
    localStorage.setItem('highContrast', enabled);
    this.playSound('click');
  }

  toggleLargeText() {
    const enabled = document.body.classList.toggle('large-text');
    localStorage.setItem('largeText', enabled);
    this.playSound('click');
  }

  toggleReducedMotion() {
    const enabled = document.body.classList.toggle('reduced-motion');
    localStorage.setItem('reducedMotion', enabled);
    this.playSound('click');
  }

  changeDifficulty() {
    this.difficulty = document.getElementById('difficultySelect').value;
    localStorage.setItem('difficulty', this.difficulty);
    this.playSound('click');
  }

  changeSkin() {
    const select = document.getElementById('skinSelect');
    const newSkin = select ? select.value : '';
    this.SKINS.forEach(skin => document.body.classList.remove(skin));
    this.currentSkin = newSkin || '';
    if (this.currentSkin) {
      document.body.classList.add(this.currentSkin);
    }
    localStorage.setItem('skin', this.currentSkin);
    this.playSound('click');
    this.claimAchievement('CHANGE_SKIN');
  }

  _getUTCDateKey() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  showSection(sectionId) {
    const sections = [
      'authSection', 'menuSection', 'gameSection',
      'dailySection', 'profileSection', 'leaderboardSection',
      'settingsSection', 'multiplayerSection', 'multiplayerLobbySection'
    ];

    if (sectionId !== 'dailySection') this._stopDailyResetCountdown();

    sections.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.classList.add('hidden');
    });

    if (sectionId !== 'gameSection' && sectionId !== 'multiplayerSection') {
      this.clearGameTimer();
      this.clearSessionTimer();
    }

    const section = document.getElementById(sectionId);
    if (section) section.classList.remove('hidden');

    const showTheme = sectionId === 'authSection' || sectionId === 'gameSection' ||
      sectionId === 'dailySection' || sectionId === 'multiplayerSection';
    document.getElementById('themeToggle').classList.toggle('hidden', !showTheme);

    if (sectionId !== 'multiplayerLobbySection') {
      const multiplayerLobbySection = document.getElementById('multiplayerLobbySection');
      if (multiplayerLobbySection) multiplayerLobbySection.classList.add('hidden');
    }
  }

  resetPauseUI() {
    this.paused = false;
    const input = document.getElementById('guessInput');
    if (input) {
      input.disabled = false;
      input.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    const puzzleImg = document.getElementById('puzzleImage');
    if (puzzleImg) puzzleImg.style.filter = '';
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) overlay.classList.add('hidden');
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';
  }

  goToGame() {
    this.gameMode = 'classic';
    this.clearGameTimer();
    this.clearSessionTimer();
    this.playSound('click');
    this.showSection('gameSection');
    this.resetPauseUI();
    this.resetSessionStats();
    this.lives = this.maxLives;
    this.updateLivesUI();
    document.getElementById('result').textContent = '';
    this.startClassicSessionTimer();
    this.loadPuzzle();
  }

  startClassicSessionTimer() {
    this.clearSessionTimer();
    this.sessionTimeRemaining = this.sessionDuration;
    this.updateSessionTimerBar();
    this.sessionTimerInterval = setInterval(() => {
      this.sessionTimeRemaining--;
      this.updateSessionTimerBar();
      if (this.sessionTimeRemaining <= 0) {
        this.endClassicSession('⏰ Time up!');
      }
    }, 1000);
  }

  getDateKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async getDailyPuzzleForDate(dateKey) {
    const ref = this.db.ref(`dailyPuzzles/${dateKey}`);
    const snap = await ref.once('value');
    let data = snap.val();

    if (data && data.question && typeof data.answer === 'number') {
      return data;
    }

    const fetched = await this.fetchBananaPuzzle();
    const payload = { question: fetched.imageUrl, answer: fetched.answer };

    try {
      await ref.transaction(curr => (curr ? curr : payload));
      const finalSnap = await ref.once('value');
      return finalSnap.val() || payload;
    } catch {
      return payload;
    }
  }


  clearSessionTimer() {
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
  }

  updateSessionTimerBar() {
    const bar = document.getElementById('timerBar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (this.sessionTimeRemaining / this.sessionDuration) * 100));
    bar.style.width = pct + '%';
    bar.style.background = pct <= 30
      ? 'linear-gradient(90deg,#ff9800,#f44336)'
      : 'linear-gradient(90deg,#81c784,#4caf50)';
    const label = document.getElementById('sessionTime');
    if (label) label.textContent = `${this.sessionTimeRemaining}s`;
  }

  endClassicSession(reasonText) {
    this.clearSessionTimer();
    this.clearGameTimer();

    const summary = `Final Score: ${this.sessionPoints} pts • Correct: ${this.sessionCorrect}/${this.sessionAttempts}`;
    this.showGameOverModal(reasonText, summary);

    this.showToast(`Game Over — ${reasonText}`, 'warning', 1800);
  }

  generateShareText() {
    const mode = this.gameMode === 'classic' ? 'Classic' : this.gameMode;
    const text =
      `🍌 Banana Blitz — ${mode} Result\n` +
      `Score: ${this.sessionPoints} pts\n` +
      `Correct: ${this.sessionCorrect}/${this.sessionAttempts}\n` +
      `Streak: ${this.streak}\n` +
      `Play with me!`;
    return text;
  }

  async shareResults() {
    const text = this.generateShareText();
    const shareData = { text, title: 'Banana Blitz' };

    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (_) { /* fall through */ }
    }

    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied results to clipboard ✅', 'success');
    } catch {
      this.showToast('Couldn’t copy — use the X button instead', 'warning');
    }
  }

  showGameOverModal(reason, summary) {
    const titleEl = document.getElementById('gameOverTitle');
    const textEl = document.getElementById('gameOverText');
    if (titleEl) titleEl.textContent = reason || 'Game Over';
    if (textEl) textEl.textContent = summary || '';

    const modal = document.getElementById('gameOverModal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  }

  hideGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
  }

  wireGameOverModalButtons() {
    const playAgain = document.getElementById('goPlayAgain');
    const goHome = document.getElementById('goHome');
    const shareBtn = document.getElementById('shareBtn');

    if (playAgain) {
      playAgain.addEventListener('click', () => {
        this.hideGameOverModal();
        this.goToGame();
      });
    }

    if (goHome) {
      goHome.addEventListener('click', () => {
        this.hideGameOverModal();
        this.returnToMenu();
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.shareResults());
    }
  }

  async loadPuzzle() {
    this.clearGameTimer();
    this.resetPauseUI();
    this.hintUsed = false;
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = 'Loading puzzle…';
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';

    try {
      const puzzleData = await this.fetchBananaPuzzle();
      if (puzzleData.imageUrl && puzzleData.answer !== undefined) {
        this.currentPuzzleAnswer = puzzleData.answer;
        const img = document.getElementById('puzzleImage');
        img.classList.remove('fade-in');
        img.src = puzzleData.imageUrl;
        img.alt = 'Banana counting puzzle';
        setTimeout(() => img.classList.add('fade-in'), 50);
        if (resultEl) resultEl.textContent = '';

        if (this.gameMode !== 'classic') {
          this.startTimer();
        }
        this.focusGuess();
      } else {
        if (resultEl) resultEl.textContent = 'Failed to load puzzle from API.';
        this.showToast('Retrying…');
        setTimeout(() => this.loadPuzzle(), 700);
      }
    } catch (error) {
      console.error('Puzzle loading error:', error);
      if (resultEl) resultEl.textContent = 'Network error loading puzzle.';
      this.showToast('Network error. Tap Next or Retry soon.');
    }
  }

  async fetchBananaPuzzle() {
    try {
      const response = await fetch('https://marcconrad.com/uob/banana/api.php');
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      const data = await response.json();
      this.currentPuzzleAnswer = data.solution;
      return { imageUrl: data.question, answer: data.solution };
    } catch (error) {
      console.error('API fetch error:', error);
      return await this.generateRandomPuzzle();
    }
  }

  async refreshDailyStreakUI() {
    const user = this.auth?.currentUser;
    const chip = document.getElementById('dailyStreak');
    if (!user || !chip) return;
    try {
      const snap = await this.db.ref('users/' + user.uid).once('value');
      const data = snap.val() || {};
      this.dailyStreak = Number(data.dailyStreak) || 0;
      chip.textContent = String(this.dailyStreak);
    } catch (e) {
      console.warn('Failed to load daily streak:', e);
    }
  }

  async generateRandomPuzzle() {
    const bananaCount = Math.floor(Math.random() * 20) + 1;
    const imageUrl = 'https://source.unsplash.com/random/400x300?banana&' + Date.now();
    this.currentPuzzleAnswer = bananaCount;
    return { imageUrl, answer: bananaCount };
  }

  focusGuess() {
    const input = document.getElementById('guessInput');
    if (input) { input.focus(); input.select(); }
  }

  getTimeLimit() {
    const base = this.difficulty === 'hard' ? 15 : 30;
    const reduction = Math.min(10, Math.floor(this.streak / 3) * 2);
    return Math.max(5, base - reduction);
  }

  startTimer() {
    this.clearGameTimer();
    const gameSection = document.getElementById('gameSection');
    if (!gameSection || gameSection.classList.contains('hidden') || this.gameMode === 'classic') {
      return;
    }
    const bar = document.getElementById('timerBar');
    const total = this.getTimeLimit();
    this.timeRemaining = total;
    if (bar) bar.style.width = '100%';
    this.timerInterval = setInterval(() => {
      const currentGameSection = document.getElementById('gameSection');
      if (!currentGameSection || currentGameSection.classList.contains('hidden') || this.paused) {
        return;
      }
      this.timeRemaining--;
      const pct = (this.timeRemaining / total) * 100;
      if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = pct <= 30 ? 'linear-gradient(90deg,#ff9800,#f44336)' : 'linear-gradient(90deg,#81c784,#4caf50)';
      }
      if (this.timeRemaining <= 0) {
        this.clearGameTimer();
        this.playSound('wrong');
        this.showScorePopup('⏰ Time Up!', '#f44336');
        const r = document.getElementById('result');
        if (r) r.textContent = 'Time up!';
        this.streak = 0;
        this.updateStatsUI();
        setTimeout(() => {
          const stillInGameSection = document.getElementById('gameSection');
          if (stillInGameSection && !stillInGameSection.classList.contains('hidden')) {
            this.loadPuzzle();
          }
        }, 1200);
      }
    }, 1000);
  }

  clearGameTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.paused = false;
    this.timeRemaining = 0;
    const bar = document.getElementById('timerBar');
    if (bar && this.gameMode !== 'classic') {
      bar.style.width = '100%';
      bar.style.background = 'linear-gradient(90deg,#81c784,#4caf50)';
    }
  }

  togglePause() {
    this.paused = !this.paused;
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = this.paused ? '▶️ Resume' : '⏸️ Pause';
    const input = document.getElementById('guessInput');
    if (input) {
      input.disabled = this.paused;
      input.classList.toggle('opacity-50', this.paused);
      input.classList.toggle('cursor-not-allowed', this.paused);
    }
    const puzzleImg = document.getElementById('puzzleImage');
    if (puzzleImg) {
      puzzleImg.style.filter = this.paused ? 'blur(8px) brightness(0.6)' : '';
    }
    if (this.paused) {
      this.showToast('Game Paused', 'warning', 1500);
    }
    this.playSound('click');
  }

  skipPuzzle() {
    if (this.gameMode === 'classic') {
      this.lives = Math.max(0, this.lives - 1);
      this.updateLivesUI();
      this.streak = 0;
      this.updateStatsUI();
      this.showToast('Skipped • Life -1', 'warning');

      if (this.lives <= 0) {
        this.endClassicSession('💔 Out of lives!');
        return;
      }
    } else {
      this.streak = 0;
      this.updateStatsUI();
      this.showToast('Skipped (streak reset)');
    }

    this.loadPuzzle();
  }

  async getHint() {
    try {
      if (this.currentPuzzleAnswer !== undefined && !this.hintUsed) {
        const range = Math.max(1, Math.floor(this.currentPuzzleAnswer * 0.2));
        const min = Math.max(0, this.currentPuzzleAnswer - range);
        const max = this.currentPuzzleAnswer + range;
        this.hintUsed = true;
        this.sessionPoints -= 3;
        this.updateStatsUI();
        this.showToast(`Hint: Between ${min} and ${max} bananas (-3 pts)`, 'warning');
      } else if (this.hintUsed) {
        this.showToast('Hint already used for this puzzle', 'info');
      } else {
        this.showToast('No hint available - puzzle not loaded', 'error');
      }
    } catch {
      this.showToast('Failed to get hint', 'error');
    }
  }

  canSubmitNow() {
    const now = Date.now();
    if (now - this.lastGuessTs < 1000) return false;
    this.lastGuessTs = now;
    return true;
  }

  async submitGuess() {
    if (!this.canSubmitNow()) {
      this.shakeInput();
      this.showToast('Slow down… (1 guess/sec)');
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      this.showToast('Please log in first', 'error');
      this.showSection('authSection');
      return;
    }

    const guessEl = document.getElementById('guessInput');
    const guess = parseInt(guessEl.value.trim());
    if (isNaN(guess)) {
      document.getElementById('result').textContent = 'Enter a valid number';
      this.playSound('wrong');
      this.shakeInput();
      return;
    }

    this.sessionAttempts++;

    const basePoints = this.difficulty === 'hard' ? 15 : 10;
    const hintPenalty = this.hintUsed ? 3 : 0;
    const comboMultiplier = 1 + Math.floor(this.streak / 3);
    const preClamp = Math.max(1, basePoints - hintPenalty);
    const totalPoints = Math.min(25, preClamp) * comboMultiplier;

    const isCorrect = guess === this.currentPuzzleAnswer;

    if (guessEl) {
      guessEl.value = '';
      this.focusGuess();
    }

    if (isCorrect) {
      document.getElementById('result').textContent = `Correct! There are ${this.currentPuzzleAnswer} bananas! 🎉`;
      this.sessionCorrect++;
      this.streak++;
      this.sessionPoints += totalPoints;
      this.playSound('correct');
      this.showScorePopup(`+${totalPoints} pts 🏅`);
      this.spawnConfetti();
      this.triggerCelebration();
      this.updateStatsUI();

      if (this.streak === 5) await this.claimAchievement('STREAK_5');
      if (this.streak === 10) await this.claimAchievement('STREAK_10');
      if (guess === this.currentPuzzleAnswer) await this.claimAchievement('PERFECT_GUESS');

      await this.updateUserStats(totalPoints, 0);
    } else {
      document.getElementById('result').textContent = `Incorrect. The answer was ${this.currentPuzzleAnswer}.`;
      this.playSound('wrong');
      this.showScorePopup('Life -1', '#d32f2f');
      this.shakeInput();

      this.lives = Math.max(0, this.lives - 1);
      this.streak = 0;
      this.updateLivesUI();
      this.updateStatsUI();

      await this.updateUserStats(0, 0);
      if (this.lives <= 0) {
        this.endClassicSession('💔 Out of lives!');
        return;
      }
    }

    this.clearGameTimer();
    setTimeout(() => {
      const stillInGame = document.getElementById('gameSection');
      if (stillInGame && !stillInGame.classList.contains('hidden') && this.gameMode === 'classic') {
        this.loadPuzzle();
      }
    }, 1200);
  }

  async updateUserStats(points, solveTime) {
    const user = this.auth.currentUser;
    if (!user) return;
    const userRef = this.db.ref('users/' + user.uid);
    const snap = await userRef.once('value');
    const curr = snap.val() || {};
    const playedNew = (curr.gamesPlayed || 0) + 1;
    const wonNew = (curr.gamesWon || 0) + (points > 0 ? 1 : 0);
    const updates = {
      gamesPlayed: playedNew,
      gamesWon: wonNew,
      totalScore: (curr.totalScore || 0) + (points || 0),
      accuracy: playedNew > 0 ? Math.round((wonNew / playedNew) * 100) : 0
    };
    if (points > 0) {
      const bestStreakCurr = curr.bestStreak || 0;
      if (this.streak > bestStreakCurr) {
        updates.bestStreak = this.streak;
      }
      const fsCurr = curr.fastestSolve;
      if (solveTime > 0 && (fsCurr === undefined || fsCurr === null || solveTime < fsCurr)) {
        updates.fastestSolve = Math.round(solveTime * 100) / 100;
      }
    }
    await userRef.update(updates);
    await this.recordGameSession(points, solveTime, points > 0);

    const updatedSnap = await userRef.once('value');
    const updatedData = updatedSnap.val() || {};
    if (updatedData.gamesWon >= 50) {
      await this.claimAchievement('GAMES_WON_50');
    }
    if (points > 0 && wonNew === 1) {
      await this.claimAchievement('FIRST_WIN');
    }
    if (solveTime > 0 && solveTime < 5) {
      await this.claimAchievement('SPEED_5');
    }

    const lb = document.getElementById('leaderboardSection');
    if (lb && !lb.classList.contains('hidden')) {
      setTimeout(() => this.leaderboardManager.loadLeaderboard(), 500);
    }
  }

  async recordGameSession(points, solveTime, won) {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      const safePoints = Math.max(0, Math.min(points, 100));
      const safeSolve = Math.max(0, Math.min(solveTime, 600));
      const safeStreak = Math.max(0, Math.min(this.streak, 999));
      const username = this.usernameGlobal || user.displayName || user.email || 'Player';
      const sessionRef = this.db.ref('gameSessions').push();
      await sessionRef.set({
        userId: user.uid,
        username,
        points: safePoints,
        solveTime: safeSolve,
        streak: safeStreak,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        mode: this.gameMode,
        won: won,
        puzzleAnswer: this.currentPuzzleAnswer
      });
    } catch (error) {
      console.error('Failed to record game session:', error);
    }
  }

  updateStatsUI() {
    if (document.getElementById('streak')) document.getElementById('streak').textContent = String(this.streak);
    if (document.getElementById('combo')) document.getElementById('combo').textContent = `x${1 + Math.floor(this.streak / 3)}`;
    if (document.getElementById('sessionPts')) document.getElementById('sessionPts').textContent = String(this.sessionPoints);
    if (document.getElementById('fastest')) document.getElementById('fastest').textContent = this.fastestSolve ? `${this.fastestSolve}s` : '—';
  }

  updateLivesUI() {
    const hearts = '❤️'.repeat(this.lives) + '🤍'.repeat(Math.max(0, this.maxLives - this.lives));
    const el = document.getElementById('livesHearts');
    if (el) el.textContent = hearts;
  }

  shakeInput() {
    const el = document.getElementById('guessInput');
    if (el) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  resetSessionStats() {
    this.streak = 0;
    this.sessionPoints = 0;
    this.sessionAttempts = 0;
    this.sessionCorrect = 0;
    this.updateStatsUI();
  }

  goToDaily() {
    this.gameMode = 'daily';
    this.showSection('dailySection');
    this.refreshDailyStreakUI();
    this.loadDailyPuzzle();
    this.dailyPageNum = 1;
    this.leaderboardManager.loadDailyLeaderboard();
  }

  async _reflectDailySolvedState(dateKey) {
    await this.refreshDailyStreakUI();
    const user = this.auth.currentUser;
    const guess = document.getElementById('dailyGuess');
    const submitBtn = document.getElementById('dailySubmit');

    if (!user) {
      if (guess) guess.disabled = false;
      if (submitBtn && submitBtn.dataset.locked !== 'true') submitBtn.disabled = false;
      return;
    }

    const stateSnap = await this.db.ref(`userDaily/${user.uid}/${dateKey}`).once('value');
    const state = stateSnap.val();
    const locked = state?.solved === true || state?.used === true;

    if (locked) {
      const solved = state?.solved === true;
      this._showDailyCompletionUI({ solved });
    } else {
      if (guess) guess.disabled = false;
      if (submitBtn && submitBtn.dataset.locked !== 'true') {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-75', 'pointer-events-none');
        submitBtn.textContent = 'Submit';
      }
    }
  }

  async loadDailyPuzzle() {
    const resultEl = document.getElementById('dailyResult');
    const submitBtn = document.getElementById('dailySubmit');
    const img = document.getElementById('dailyImage');
    const meta = document.getElementById('dailyMeta');

    resultEl.textContent = 'Loading daily challenge…';
    this.setButtonBusy(submitBtn, true);

    const dateKey = this._getUTCDateKey();
    try {
      let puzzle = null;
      try {
        const snap = await this.db.ref(`dailyPuzzles/${dateKey}`).once('value');
        puzzle = snap.val();
      } catch (permErr) {
        console.warn('dailyPuzzles read failed, falling back to API/image only:', permErr);
      }

      if (!puzzle || !puzzle.question || typeof puzzle.solution !== 'number') {
        const fetched = await this.fetchBananaPuzzle();
        puzzle = { question: fetched.imageUrl, solution: fetched.answer };
      }

      this.currentDailyAnswer = puzzle.solution;
      if (img) {
        img.src = puzzle.question;
        img.alt = 'Daily banana counting challenge';
        img.classList.remove('fade-in'); void img.offsetWidth; img.classList.add('fade-in');
      }
      if (meta) meta.textContent = `Daily Challenge for ${dateKey}`;
      resultEl.textContent = '';

      await this._reflectDailySolvedState(dateKey);
    } catch (err) {
      console.error('Daily puzzle loading error:', err);
      resultEl.textContent = 'Daily puzzle unavailable.';
    } finally {
      this.setButtonBusy(submitBtn, false);
      const g = document.getElementById('dailyGuess');
      if (g) { g.value = ''; g.focus(); }
    }
  }

  async submitDaily() {
    const user = this.auth?.currentUser;
    if (!user) {
      this.showToast('Please log in first', 'error');
      this.showSection('authSection');
      return;
    }

    const guessEl = document.getElementById('dailyGuess');
    const resultEl = document.getElementById('dailyResult');
    const submitBtn = document.getElementById('dailySubmit');

    const guess = parseInt((guessEl?.value || '').trim(), 10);
    if (isNaN(guess)) {
      if (resultEl) resultEl.textContent = 'Enter a valid number';
      return;
    }

    this.setButtonBusy(submitBtn, true);

    const dateKey = this._getUTCDateKey();
    const puzzleRef = this.db.ref(`dailyPuzzles/${dateKey}`);
    const stateRef = this.db.ref(`userDaily/${user.uid}/${dateKey}`);
    let lockedToday = false;

    try {
      const stateSnap = await stateRef.once('value');
      const state = stateSnap.val();
      if (state && state.used === true) {
        resultEl.textContent = 'You already played today. Come back tomorrow!';
        this.showToast('Already attempted today', 'warning');
        this.lockDailyControls('You already played today. Come back tomorrow!');
        return;
      }

      let solution = this.currentDailyAnswer;
      try {
        const puzzleSnap = await puzzleRef.once('value');
        const puzzle = puzzleSnap.val();
        if (puzzle && typeof puzzle.solution === 'number') solution = puzzle.solution;
      } catch (permErr) {
        console.warn('dailyPuzzles read failed during submit; using in-memory answer if present.', permErr);
      }

      if (typeof solution !== 'number') {
        resultEl.textContent = 'Daily challenge is not available yet. Please try again later.';
        this.showToast('Daily puzzle not published', 'warning');
        return;
      }

      const isCorrect = guess === solution;

      if (isCorrect) {
        await stateRef.set({
          used: true,
          solved: true,
          triedAt: firebase.database.ServerValue.TIMESTAMP
        });

        this.lockDailyControls(`Correct! Daily challenge completed 🎉 There were ${solution} bananas.`);
        this._showDailyCompletionUI({ solved: true, solution });
        lockedToday = true;

        this.spawnConfetti();
        const dailyPoints = 25;
        this.sessionPoints += dailyPoints;
        await this.updateUserStats(dailyPoints, 0);
        await this.updateDailyStreakOnSolve(dateKey);
        this.leaderboardManager?.loadDailyLeaderboard?.();
        this.showToast('Daily complete! +25 pts', 'success');

      } else {
        await stateRef.set({
          used: true,
          solved: false,
          triedAt: firebase.database.ServerValue.TIMESTAMP
        });

        this.lockDailyControls('Incorrect. Come back tomorrow!');
        this._showDailyCompletionUI({ solved: false });
        lockedToday = true;

        this.showToast('Daily attempt used for today', 'warning');
      }

      await this._reflectDailySolvedState(dateKey);

    } catch (err) {
      console.error('Daily submission error:', err);
      const msg = (err && err.code === 'PERMISSION_DENIED')
        ? 'Permission denied when saving your daily attempt. Check database rules.'
        : 'Network or server error submitting daily guess.';
      resultEl.textContent = msg;
      this.showToast(msg, 'error');

    } finally {
      this.setButtonBusy(submitBtn, false);

      if (lockedToday) {
        this.lockDailyControls();
        if (guessEl) {
          guessEl.blur();
        }
      } else {
        if (guessEl) {
          guessEl.value = '';
          guessEl.focus();
        }
      }
    }
  }

  _startDailyResetCountdown() {
    this._stopDailyResetCountdown();
    const el = document.getElementById('dailyCountdown');
    if (!el) return;

    const tick = () => {
      const now = new Date();
      const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1, 0, 0, 0
      ));
      const ms = next - now;
      if (ms <= 0) {
        el.textContent = '00:00:00';
        this._stopDailyResetCountdown();
        return;
      }
      const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
      const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      el.textContent = `${h}:${m}:${s}`;
    };

    tick();
    this._dailyCountdownInterval = setInterval(tick, 1000);
  }

  _stopDailyResetCountdown() {
    if (this._dailyCountdownInterval) {
      clearInterval(this._dailyCountdownInterval);
      this._dailyCountdownInterval = null;
    }
  }

  _showDailyCompletionUI({ solved, solution } = {}) {
    this.lockDailyControls(solved
      ? `Correct! Daily challenge completed 🎉 There were ${solution} bananas.`
      : 'Incorrect. Come back tomorrow!'
    );

    const play = document.getElementById('dailyPlayArea');
    const card = document.getElementById('dailyCompleteCard');
    if (play) play.classList.add('hidden');
    if (card) card.classList.remove('hidden');

    const title = document.getElementById('dailyCompleteTitle');
    const sub = document.getElementById('dailyCompleteSubtitle');
    if (title) {
      title.textContent = solved
        ? 'Nice! You finished today’s Daily 🎉'
        : 'You’ve used today’s attempt';
    }
    if (sub) {
      sub.innerHTML = solved
        ? `Great job. Come back for a new challenge in <span id="dailyCountdown">--:--:--</span>.`
        : `No worries—try again tomorrow in <span id="dailyCountdown">--:--:--</span>.`;
    }

    const streakWrap = document.getElementById('dailyStreakLine');
    const streakVal = document.getElementById('dailyStreakValue');
    if (streakWrap && streakVal && Number.isFinite(this.dailyStreak)) {
      streakVal.textContent = this.dailyStreak;
      streakWrap.classList.remove('hidden');
    }

    this._startDailyResetCountdown();
  }


  lockDailyControls(message) {
    const guess = document.getElementById('dailyGuess');
    const submit = document.getElementById('dailySubmit');

    if (message) {
      const resultEl = document.getElementById('dailyResult');
      if (resultEl) resultEl.textContent = message;
    }
    if (guess) {
      guess.disabled = true;
      guess.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (submit) {
      submit.disabled = true;
      submit.classList.add('opacity-75', 'pointer-events-none');
      submit.dataset.locked = 'true';
      if (!message) submit.textContent = 'Come back tomorrow';
    }

  }

  openProfile() {
    this.showSection('profileSection');
    this.loadProfile();
  }

  async loadProfile() {
    const user = this.auth.currentUser;
    if (!user) {
      this.showToast('Please log in first', 'error');
      this.showSection('authSection');
      return;
    }
    try {
      const userRef = this.db.ref('users/' + user.uid);
      const userSnapshot = await userRef.once('value');
      const userData = userSnapshot.val() || {};
      const uaSnap = await this.db.ref(`userAchievements/${user.uid}`).once('value');
      const codes = uaSnap.val() || {};
      const achievements = Object.keys(codes)
        .filter(code => codes[code] === true)
        .map(code => ({
          code,
          name: (this.ACH[code]?.name) || code,
          points: (this.ACH[code]?.points) ?? 0
        }));
      this.displayProfile(userData, achievements);
    } catch (error) {
      console.error('Profile loading error:', error);
      document.getElementById('profileStats').innerHTML =
        '<div class="text-center text-gray-500">Failed to load profile</div>';
    }
  }

  displayProfile(userData, achievements) {
    const accuracy = (userData.accuracy ?? null) !== null ? `${userData.accuracy}%` : '—';
    const initialsEl = document.getElementById('profileInitials');
    if (initialsEl && userData.username) {
      initialsEl.textContent = userData.username.charAt(0).toUpperCase();
    }
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) usernameEl.textContent = userData.username || 'Player';
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = userData.email || '';
    const pbFastest = (userData.fastestSolve ?? null) !== null ? `${userData.fastestSolve}s` : '—';
    const pbStreak = (userData.bestStreak ?? null) !== null ? userData.bestStreak : '0';
    document.getElementById('profileStats').innerHTML = ` 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">User:</p> 
      <p>${userData.username || '(unknown)'}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Total Score:</p> 
      <p>${userData.totalScore || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">PB Fastest Solve:</p> 
      <p>${pbFastest}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">PB Best Streak:</p> 
      <p>${pbStreak}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Rounds Played:</p> 
      <p>${userData.gamesPlayed || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Rounds Won:</p> 
      <p>${userData.gamesWon || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Accuracy:</p> 
      <p>${accuracy}</p> 
    </div>`;

    const achList = document.getElementById('achList');
    achList.innerHTML = '';

    const unlockedAchievementCodes = new Set(achievements.map(ach => ach.code));

    if (Object.keys(this.ACH).length === 0) {
      achList.innerHTML = '<li class="text-center text-gray-500 py-4">No achievements available yet.</li>';
      return;
    }

    Object.entries(this.ACH).forEach(([code, { name, points, description }]) => {
      const isUnlocked = unlockedAchievementCodes.has(code);
      const li = document.createElement('li');
      li.className = `flex items-center space-x-3 p-3 rounded-lg ${isUnlocked
        ? 'bg-green-50 dark:bg-green-900/20'
        : 'bg-gray-100 dark:bg-gray-700/50 opacity-60'
        }`;
      li.innerHTML = ` 
        <span class="text-2xl">${isUnlocked ? '🏅' : '🔒'}</span> 
        <div> 
          <p class="font-bold ${isUnlocked ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'
        }">${name}</p> 
          <p class="text-sm ${isUnlocked ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'
        }">${points} pts${description ? ` - ${description}` : ''}</p> 
        </div>`;
      achList.appendChild(li);
    });
  }

  async claimAchievement(code) {
    const user = this.auth.currentUser;
    if (!user) return;
    const meta = this.ACH[code];
    if (!meta) return;
    try {
      const flagRef = this.db.ref(`userAchievements/${user.uid}/${code}`);
      const before = await flagRef.once('value');
      if (before.val() === true) return;
      const txn = await flagRef.transaction(curr => (curr === true ? curr : true));
      if (txn.committed && before.val() !== true && txn.snapshot.val() === true) {
        await this.db
          .ref(`users/${user.uid}/totalScore`)
          .transaction(curr => (curr || 0) + meta.points);
        this.showToast(`Achievement unlocked: ${meta.name}! +${meta.points}pts`, 'success');
      }
    } catch (err) {
      console.error('Achievement claim error:', err);
    }
  }

  initCelebrations() {
    this._celebrationImages = [
      'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/bIEzoZX0qJaG6s6frc/giphy.gif',
      'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
      'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
      'https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vmon3eAOp1WfK/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/o75ajIFH0QnQC3nCeD/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/t3sZxY5zS5B0z5zMIz/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/artj92V8o75VPL7AeQ/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/lMameLIF8voLu8HxWV/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YTbZzCkRQCEJa/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xT8qAY7e9If38xkrIY/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/GxIdtANXpn3qL1FG25/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/gFi7V9CRBQVW0/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cnY5bDFodDdlaWVnb2J3ZXVhejVwdGlnbGtodGFodHBxMWR6N3h4aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/m8crpzTJFRDPhqqhXJ/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cnY5bDFodDdlaWVnb2J3ZXVhejVwdGlnbGtodGFodHBxMWR6N3h4aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/1q9addeaZMx020Gv8u/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cnY5bDFodDdlaWVnb2J3ZXVhejVwdGlnbGtodGFodHBxMWR6N3h4aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/OR1aQzSbvf4DrgX22C/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26h0pHNtHKjmDo4WQ/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/doPrWYzSG1Vao/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3gxZWFtcDY2cWI2cTA0ZWg2Mm4zMGg0Zzg4cmFmYzE0YTJ5cGdqaiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/NsBjgqR8jBy2mMptZF/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ddHhhUBn25cuQ/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/s2qXK8wAvkHTO/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/F1P5wA3Ai0jFAAWQFA/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/m9cK1kd1qkowapgvEx/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmJrOWd6YmZ3Ym1xNHN0ank1ZDBmMW9jcWdycGQwdXJoZXo2Z3JsNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/doPrWYzSG1Vao/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Is1O1TWV0LEJi/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExejUzN2tlZ3J6aXBpOTJmamZvbmQ1MWwxY2xxdmV4b29objBpc2pkayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/okTPBH1snhbG0gQygg/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cTl4eGdtNmIzbWZmdmt3bWh2cnU0ODlqc3hzdWMxeWFjeWEzdDRqMCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Yi7cN4zscHOZbtN1vc/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3MW5kbWRoNTY5dzhlM3VwNDU4Zno5MXA2Ynp4NHB3ZGp3eTZuM3h3eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QlvPwCTw59B2E/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3MW5kbWRoNTY5dzhlM3VwNDU4Zno5MXA2Ynp4NHB3ZGp3eTZuM3h3eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/pOTvR5CtiB4sWMFHPG/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3MW5kbWRoNTY5dzhlM3VwNDU4Zno5MXA2Ynp4NHB3ZGp3eTZuM3h3eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/bD4tTQhR9KYL4EHuax/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3MW5kbWRoNTY5dzhlM3VwNDU4Zno5MXA2Ynp4NHB3ZGp3eTZuM3h3eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/zD26Xh2jJPBDy/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dzk4NnhtY2R6em5zbThuOXZnenJnano2ZWZpa2c0NnljMmExM2kxOSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/K4HXF5v3uAhQKuCOW5/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bWYwbmRlbjR3cndycjcyamVqemY1cTBsYzU4cmV6ZDZocml0dG9lYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/KjnjFwDSTtljvhcKwC/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bWYwbmRlbjR3cndycjcyamVqemY1cTBsYzU4cmV6ZDZocml0dG9lYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7abIileRivlGr8Nq/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dml2N2c3YXFveWRrMnMzaTFwZzIzdHdueG9xaDJ0dXY2Zmh4OHd5YyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xThuWp2hJABbmc20Ew/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dml2N2c3YXFveWRrMnMzaTFwZzIzdHdueG9xaDJ0dXY2Zmh4OHd5YyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/6nuiJjOOQBBn2/giphy.gif',
      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dml2N2c3YXFveWRrMnMzaTFwZzIzdHdueG9xaDJ0dXY2Zmh4OHd5YyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/htHMAjOrrDcUXW7Bn8/giphy.gif',
    ];

    this._celebrationQueue = this._celebrationImages.slice();
    for (let i = this._celebrationQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._celebrationQueue[i], this._celebrationQueue[j]] = [this._celebrationQueue[j], this._celebrationQueue[i]];
    }

    this._celebrationCache = new Map();
    this._celebrationQueue.forEach(url => {
      const img = new Image();
      img.src = url;
      this._celebrationCache.set(url, img);
    });
  }

  _getNextCelebrationUrl() {
    if (!this._celebrationQueue || this._celebrationQueue.length === 0) {
      this.initCelebrations();
    }
    const url = this._celebrationQueue.shift();
    this._celebrationQueue.push(url);
    return url;
  }

  async triggerCelebration({ autoHideMs = 2500 } = {}) {
    const wrap = document.getElementById('celebration');
    const imgEl = document.getElementById('celebrationGif');

    wrap?.classList.remove('hidden');
    if (!imgEl) return;

    let tries = 3;
    let chosen = null;
    while (tries-- > 0) {
      const candidate = this._getNextCelebrationUrl();
      const cached = this._celebrationCache?.get(candidate);

      if (cached && cached.complete && cached.naturalWidth > 0) {
        chosen = candidate;
        break;
      }

      const ok = await new Promise(res => {
        const probe = new Image();
        probe.onload = () => res(true);
        probe.onerror = () => res(false);
        probe.src = candidate;
      });
      if (ok) {
        chosen = candidate;
        break;
      }
    }

    imgEl.src = chosen || 'assets/images/logo.png';
    imgEl.onerror = function () { this.src = 'assets/images/logo.png'; };

    if (autoHideMs && wrap) {
      clearTimeout(this._celebrationHideT);
      this._celebrationHideT = setTimeout(() => wrap.classList.add('hidden'), autoHideMs);
    }
  }

  hideCelebration() {
    document.getElementById('celebration').classList.add('hidden');
    document.getElementById('celebrationGif').src = '';
    this.loadPuzzle();
  }

  showScorePopup(text, color = '#4caf50') {
    const p = document.createElement('div');
    p.className = 'fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl font-bold z-50 animate-bounce';
    p.style.color = color;
    p.textContent = text;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }

  spawnConfetti() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    for (let i = 0; i < 25; i++) {
      const c = document.createElement('div');
      c.className = 'fixed w-2 h-2 rounded-full pointer-events-none z-40';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.top = '-10px';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animation = `confetti-fall ${2 + Math.random() * 1.5}s linear forwards`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
    if (!document.getElementById('confetti-style')) {
      const style = document.createElement('style');
      style.id = 'confetti-style';
      style.textContent = ` 
        @keyframes confetti-fall { 
          0% { transform: translateY(0) rotate(0deg); opacity: 1; } 
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; } 
        } 
        .shake { animation: shake 0.5s ease-in-out; } 
        @keyframes shake { 
          0%, 100% { transform: translateX(0); } 
          25% { transform: translateX(-5px); } 
          75% { transform: translateX(5px); } 
        } 
        .fade-in { animation: fadeIn 0.5s ease-in; } 
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
      `;
      document.head.appendChild(style);
    }
  }

  returnToMenu() {
    this.clearGameTimer();
    this.clearSessionTimer();
    this.showSection('menuSection');
    this.playSound('click');
  }

  openSettings() {
    this.playSound('click');
    this.showSection('settingsSection');
  }

  goToMultiplayer() {
    this.clearGameTimer();
    this.clearSessionTimer();
    this.playSound('click');
    if (!this.multiplayerManager.currentRoom) {
      this.showSection('multiplayerLobbySection');
      this.multiplayerManager.initializeLobby();
    } else {
      this.showSection('multiplayerSection');
    }
  }

  async submitMultiplayerGuess() {
    await this.multiplayerManager.submitGuess();
  }

  resetProgress() {
    if (confirm('Are you sure you want to reset all local progress? This cannot be undone.')) {
      localStorage.clear();
      this.applySavedSettings();
      this.showToast('Local progress reset', 'success');
    }
  }

  exportData() {
    const data = {
      settings: {
        theme: localStorage.getItem('theme'),
        soundEnabled: localStorage.getItem('soundEnabled'),
        sfxVolume: localStorage.getItem('sfxVolume'),
        highContrast: localStorage.getItem('highContrast'),
        largeText: localStorage.getItem('largeText'),
        reducedMotion: localStorage.getItem('reducedMotion'),
        difficulty: localStorage.getItem('difficulty'),
        skin: localStorage.getItem('skin'),
        tourDone: localStorage.getItem('tourDone')
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'banana-blitz-data.json';
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Data exported', 'success');
  }

  async updateDailyStreakOnSolve(dateKey) {
    const user = this.auth.currentUser;
    if (!user) return;

    const userRef = this.db.ref('users/' + user.uid);
    const snap = await userRef.once('value');
    const data = snap.val() || {};
    const lastDaily = data.lastDaily || 0;

    const [y, m, d] = dateKey.split('-').map(Number);
    const todayUtc = Date.UTC(y, m - 1, d);

    if (todayUtc === lastDaily) return;

    const ONE_DAY = 86400000;
    const streak =
      (lastDaily && (todayUtc - lastDaily === ONE_DAY))
        ? (data.dailyStreak || 0) + 1
        : 1;

    await userRef.update({ dailyStreak: streak, lastDaily: todayUtc });
    this.dailyStreak = streak;

    if (streak === 1 && (data.dailyStreak || 0) === 0) {
      await this.claimAchievement('FIRST_DAILY');
    }
    if (streak === 7) {
      await this.claimAchievement('DAILY_STREAK_7');
    }

    const streakEl = document.getElementById('dailyStreak');
    if (streakEl) streakEl.textContent = streak;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.game = new BananaBlitzGame();
});

window.toggleTheme = () => window.game.toggleTheme();
window.showHelp = () => window.game.showTutorial(30);
window.toggleSound = () => window.game.toggleSound();
window.toggleMusic = () => window.game.toggleMusic();
window.toggleHighContrast = () => window.game.toggleHighContrast();
window.toggleLargeText = () => window.game.toggleLargeText();
window.toggleReducedMotion = () => window.game.toggleReducedMotion();
window.changeDifficulty = () => window.game.changeDifficulty();
window.changeSkin = () => window.game.changeSkin();
window.goToGame = () => window.game.goToGame();
window.returnToMenu = () => window.game.returnToMenu();
window.openSettings = () => window.game.openSettings();
window.submitGuess = () => window.game.submitGuess();
window.togglePause = () => window.game.togglePause();
window.skipPuzzle = () => window.game.skipPuzzle();
window.getHint = () => window.game.getHint();
window.goToDaily = () => window.game.goToDaily();
window.submitDaily = () => window.game.submitDaily();
window.openProfile = () => window.game.openProfile();
window.hideCelebration = () => window.game.hideCelebration();

window.playAgainSameRoom = () => window.game.multiplayerManager.playAgainSameRoom();
window.goToMultiplayer = () => window.game.goToMultiplayer();
window.submitMultiplayerGuess = () => window.game.submitMultiplayerGuess();
window.createRoom = () => window.game.multiplayerManager.createRoom();
window.joinRoom = () => window.game.multiplayerManager.joinRoom();
window.leaveRoom = () => window.game.multiplayerManager.leaveRoom();
window.toggleReady = () => window.game.multiplayerManager.toggleReady();
window.startGame = () => window.game.multiplayerManager.startGame();

window.showLogin = () => window.game.authManager.showLogin();
window.showRegister = () => window.game.authManager.showRegister();
window.login = () => window.game.authManager.login();
window.register = () => window.game.authManager.register();
window.logout = () => window.game.authManager.logout();

window.loadLeaderboard = () => window.game.leaderboardManager.loadLeaderboard();
window.dailyPage = (delta) => window.game.leaderboardManager.dailyPage(delta);

window.resetProgress = () => window.game.resetProgress();
window.exportData = () => window.game.exportData();

window.loginWithGoogle = () => window.game.authManager.loginWithGoogle();

window.changeUsername = () => window.game.authManager.startChangeUsername();
window.openChangeUsername = () => window.game.authManager.openChangeUsernameModal();
window.closeChangeUsername = () => window.game.authManager.closeChangeUsernameModal();
window.submitChangeUsername = () => window.game.authManager.submitChangeUsernameModal();

window.toggleTimeframe = async () => {
  const icon = document.getElementById('lbRefreshIcon');
  icon?.classList.add('animate-spin');
  try {
    await window.game.leaderboardManager.refreshGlobal();
  } finally {
    icon?.classList.remove('animate-spin');
  }
};

window.openAddFriendModal = () => {
  document.getElementById('addFriendModal')?.classList.remove('hidden');
  document.getElementById('addFriendModal')?.classList.add('flex');
  setTimeout(() => document.getElementById('addFriendInput')?.focus(), 50);
};
window.closeAddFriendModal = () => {
  document.getElementById('addFriendModal')?.classList.add('hidden');
  document.getElementById('addFriendModal')?.classList.remove('flex');
};

window.addFriendSubmit = async () => {
  const username = (document.getElementById('addFriendInput')?.value || '').trim();
  if (!username) return window.game.showToast('Enter a username', 'warning');

  try {
    const fm = window.game.friendsManager;
    const user = await fm.findUserByUsername(username.toLowerCase());
    if (!user) return window.game.showToast('User not found', 'error');

    await fm.sendInvite(user.uid, username);
    closeAddFriendModal();
  } catch (e) {
    console.error(e);
    window.game.showToast('Could not send invite', 'error');
  }
};

async function renderInvites() {
  const invites = await window.game.friendsManager.listMyInvites();
  const box = document.getElementById('invitesBox');
  const count = document.getElementById('invitesCount');
  if (!box) return;

  if (count) count.textContent = String(invites.length || 0);

  if (!invites.length) {
    box.innerHTML = '<div class="text-sm text-gray-500">No pending invites.</div>';
    return;
  }

  box.innerHTML = '';
  invites.forEach(inv => {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mb-2';
    row.innerHTML = `
      <div class="font-medium text-gray-800 dark:text-gray-100">@${inv.username || 'Player'}</div>
      <div class="space-x-2">
        <button class="px-2 py-1 rounded bg-green-500 text-white"
          onclick="(async()=>{await game.friendsManager.acceptInvite('${inv.inviterUid}'); await renderInvites();})()">
          Accept
        </button>
        <button class="px-2 py-1 rounded bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white"
          onclick="(async()=>{await game.friendsManager.declineInvite('${inv.inviterUid}'); await renderInvites();})()">
          Decline
        </button>
      </div>
    `;
    box.appendChild(row);
  });
}
window.renderInvites = renderInvites;

const LB_ACTIVE = ['bg-yellow-500', 'text-white'];
const LB_INACTIVE = ['bg-gray-200', 'hover:bg-gray-300', 'text-gray-800', 'dark:bg-gray-600', 'dark:hover:bg-gray-500', 'dark:text-white'];

function setLbTab(btn, isActive) {
  if (!btn) return;
  btn.classList.remove(...LB_ACTIVE, ...LB_INACTIVE);
  btn.classList.add(...(isActive ? LB_ACTIVE : LB_INACTIVE));
}

window.changeLeaderboardType = async (type) => {
  const g = document.getElementById('lbGlobal');
  const f = document.getElementById('lbFriends');

  setLbTab(g, type === 'global');
  setLbTab(f, type === 'friends');

  const friendsUI = (show) => {
    document.getElementById('friendsToolbar')?.classList.toggle('hidden', !show);
    document.getElementById('invitesPanel')?.classList.toggle('hidden', !show);
  };

  const FT_ACTIVE = ['bg-yellow-500', 'text-white'];
  const FT_INACTIVE = ['bg-gray-200', 'dark:bg-gray-600', 'dark:text-white'];

  function setFriendsBtn(btn, isActive) {
    if (!btn) return;
    btn.classList.remove(...FT_ACTIVE, ...FT_INACTIVE);
    btn.classList.add(...(isActive ? FT_ACTIVE : FT_INACTIVE));
  }

  window.changeFriendsScope = async (scope) => {
    const allBtn = document.getElementById('friendsAllTimeBtn');
    const todayBtn = document.getElementById('friendsTodayBtn');

    setFriendsBtn(allBtn, scope === 'all');
    setFriendsBtn(todayBtn, scope === 'today');

    if (scope === 'all') {
      document.getElementById('lbTimeframe').textContent = 'Friends — All Time';
      await window.game.leaderboardManager.loadFriendsLeaderboardAllTime();
    } else {
      document.getElementById('lbTimeframe').textContent = 'Friends — Today';
      await window.game.leaderboardManager.loadFriendsLeaderboardToday();
    }
  };

  if (type === 'global') {
    friendsUI(false);
    document.getElementById('lbHeaderTitle').textContent = '🏆 Global Leaderboard';
    document.getElementById('lbTimeframe').textContent = 'Global — All Time';
    await window.game.leaderboardManager.refreshGlobal();
  } else {
    friendsUI(true);
    document.getElementById('lbHeaderTitle').textContent = '👥 Friends Leaderboard';
    document.getElementById('lbTimeframe').textContent = 'Friends — All Time';
    await window.renderInvites();
    await window.changeFriendsScope('all');

    if (window.game.leaderboardManager.loadFriendsLeaderboardAllTime) {
      await window.game.leaderboardManager.loadFriendsLeaderboardAllTime();
    } else {
      window.game.showToast('Friends leaderboard coming soon!', 'info');
    }
  }
};

