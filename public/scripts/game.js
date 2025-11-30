const CLASSIC_LEVEL_TIERS = [
  { levels: 1, timer: 60, label: 'Kickoff' },
  { levels: 1, timer: 55, label: 'Sprint' },
  { levels: 1, timer: 50, label: 'Momentum' },
  { levels: 1, timer: 45, label: 'Rush' },
  { levels: 2, timer: 40, label: 'Challenge' },
  { levels: 2, timer: 35, label: 'Hardcore' },
  { levels: 2, timer: 32, label: 'Blitz' },
  { levels: 2, timer: 28, label: 'Extreme' },
  { levels: 2, timer: 25, label: 'Overdrive' },
  { levels: 3, timer: 22, label: 'Frenzy' },
  { levels: 3, timer: 18, label: 'Chaos' },
  { levels: Infinity, timer: 15, label: 'Legendary' }
];

class BananaBlitzGame {
  initAvatarFeature() {
    const avatarContainer = document.getElementById('profileAvatarContainer');
    if (avatarContainer) {
      if (this._avatarClickHandler) {
        avatarContainer.removeEventListener('click', this._avatarClickHandler);
      }
      this._avatarClickHandler = () => window.openAvatarModal();
      avatarContainer.addEventListener('click', this._avatarClickHandler);
    }
    this._selectedAvatar = null;
    this._uploadedAvatarFile = null;
  }

  async renderPresetAvatars() {
    const presetAvatars = [
      'avatar1.png',
      'avatar2.png',
      'avatar3.png',
      'avatar4.png',
      'avatar5.png',
      'avatar6.png',
      'avatar7.png',
      'avatar8.png',
      'avatar9.png',
      'avatar10.png'
    ];
    const container = document.getElementById('presetAvatars');
    if (!container) return;
    container.innerHTML = '';
    presetAvatars.forEach(filename => {
      const img = document.createElement('img');
      img.src = `assets/images/avatars/${filename}`;
      img.alt = 'Avatar';
      img.className = 'w-14 h-14 rounded-full object-cover border-2 border-transparent cursor-pointer hover:border-yellow-500 transition-all';
      img.onclick = () => {
        this._selectedAvatar = img.src;
        this._uploadedAvatarFile = null;
        Array.from(container.children).forEach(child => child.classList.remove('ring-4', 'ring-yellow-400'));
        img.classList.add('ring-4', 'ring-yellow-400');
        const modalPreview = document.getElementById('avatarModalPreview');
        const modalInitials = document.getElementById('avatarModalPreviewInitials');
        const modalLabel = document.getElementById('avatarModalPreviewLabel');
        if (modalPreview) {
          modalPreview.src = img.src;
          modalPreview.style.display = '';
        }
        if (modalInitials) modalInitials.style.display = 'none';
        if (modalLabel) modalLabel.textContent = 'Selected Avatar';
      };
      container.appendChild(img);
    });
  }

  async saveAvatarSelection() {
    const user = this.auth.currentUser;
    if (!user) return;
    let avatarUrl = null;
    if (this._uploadedAvatarFile) {
      avatarUrl = await this.uploadAvatarToStorage(user.uid, this._uploadedAvatarFile);
      try {
        localStorage.setItem('customAvatar_' + user.uid, avatarUrl);
        this.showToast('Custom avatar saved (local only)', 'success');
      } catch (e) {
        this.showToast('Failed to save avatar: storage full?', 'error');
      }
    } else if (this._selectedAvatar) {
      avatarUrl = this._selectedAvatar;
      await this.db.ref('users/' + user.uid + '/avatar').set(avatarUrl);
      localStorage.removeItem('customAvatar_' + user.uid);
      this.showToast('Avatar updated!', 'success');
    }
    const avatarImg = document.getElementById('profileAvatarImg');
    const initialsCont = document.getElementById('profileInitialsContainer');
    if (avatarUrl && avatarImg) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = '';
      if (initialsCont) initialsCont.style.display = 'none';
    } else {
      if (avatarImg) avatarImg.style.display = 'none';
      if (initialsCont) initialsCont.style.display = '';
    }
    this.loadProfile();
    window.closeAvatarModal();
  }

  async uploadAvatarToStorage(uid, file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  constructor() {
    this.gameMode = 'classic';
    this.dailyPageNum = 1;
    this.lastLbRows = [];

    this.usernameGlobal = null;
    this.difficulty = localStorage.getItem('gameDifficulty') || 'normal';
    this.timerInterval = null;
    this.timeRemaining = 0;
    this.paused = false;
    this.hintUsed = false;

    this.streak = 0;
    this.dailyStreak = 0;

    this.bestStreak = 0;
    this.sessionPoints = 0;
    this.lastGuessTs = 0;

    this.sessionAttempts = 0;
    this.sessionCorrect = 0;

    this.loaderStart = performance.now();
    this.LOADER_MIN_MS = 1600;

    this.SKINS = ['skin-jungle', 'skin-neon', 'skin-mono'];
    this.currentSkin = localStorage.getItem('gameSkin') || '';
    if (this.currentSkin) document.body.classList.add(this.currentSkin);

    this.BGM_TRACKS = {
      '': 'assets/audio/music/music-default yellow.mp3',
      'skin-jungle': 'assets/audio/music/music-jungle adventure.mp3',
      'skin-neon': 'assets/audio/music/music-neon nights.mp3',
      'skin-mono': 'assets/audio/music/music-monochromatic.mp3',
    };

    this.sounds = {
      click: new Audio('assets/audio/sfx/click.wav'),
      correct: new Audio('assets/audio/sfx/correct.mp3'),
      wrong: new Audio('assets/audio/sfx/wrong.wav'),
      levelup: new Audio('assets/audio/sfx/level up.mp3'),
      monkey: new Audio('assets/audio/sfx/monkey sound.mp3'),
      bgm: new Audio(this.BGM_TRACKS[this.currentSkin] || this.BGM_TRACKS[''])
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
    this.sessionTimerInterval = null;
    this.currentSessionRef = null;

    this.currentLevel = 1;
    this.puzzlesCompleted = 0;
    this.puzzlesPerLevel = 5;
    this.levelTimeRemaining = 0;
    this.currentLevelTier = null;
    this.lastAnnouncedTierLabel = null;
    this._difficultyBannerTimeout = null;
    this._pendingClassicTimerRestart = false;

    this.ACH = {
      STREAK_5: { name: 'Hot Streak', points: 50, description: 'Achieve a streak of 5 correct answers' },
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
    } catch (error) {
      console.error('Firebase services unavailable, enabling mock services:', error);
      this.createMockFirebaseServices();
    }

    this.authManager = new AuthManager(this);
    this.auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        this.leaderboardManager?.onAuthReady();
      }
    });
    this.leaderboardManager = new LeaderboardManager(this);
    this._pendingLeaderboardLoad = false;
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
          localStorage.setItem(`mock_db_${path}`, JSON.stringify(data));
          return Promise.resolve();
        },
        update: (data) => {
          const existing = JSON.parse(localStorage.getItem(`mock_db_${path}`) || '{}');
          localStorage.setItem(`mock_db_${path}`, JSON.stringify({ ...existing, ...data }));
          return Promise.resolve();
        },
        remove: () => {
          localStorage.removeItem(`mock_db_${path}`);
          return Promise.resolve();
        },
        on: (event, callback) => {
          if (event === 'value') {
            const data = JSON.parse(localStorage.getItem(`mock_db_${path}`) || 'null');
            setTimeout(() => callback({ val: () => data }), 100);
          }
          return () => { };
        },
        once: (event) => {
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
    this.initScreensaver();
  }

  initScreensaver() {
    const INACTIVITY_TIMEOUT = 12000;
    const screensaver = document.getElementById('screensaver');
    const messageEl = document.getElementById('screensaverMessage');
    const bananaContainer = document.getElementById('screensaverBananas');
    const skyContainer = document.getElementById('screensaverSky');
    if (!screensaver) return;

    const skyThemes = {
      morning: {
        caption: 'Sunrise yawns over Banana Grove',
        icon: '🌅',
        elements: ['cloud cloud-1', 'cloud cloud-2', 'cloud cloud-3', 'cloud cloud-4', 'cloud cloud-5', 'cloud cloud-6', 'cloud cloud-7', 'sky-glow', 'sky-sun-rays', 'sparkle sparkle-1', 'sparkle sparkle-2', 'sparkle sparkle-3', 'sparkle sparkle-4']
      },
      afternoon: {
        caption: 'Lazy clouds guard the midday jungle',
        icon: '🌤️',
        elements: ['cloud cloud-1', 'cloud cloud-2', 'cloud cloud-3', 'cloud cloud-4', 'cloud cloud-5', 'cloud cloud-6', 'cloud cloud-7', 'sky-glow', 'sparkle sparkle-1', 'sparkle sparkle-2', 'sparkle sparkle-3']
      },
      evening: {
        caption: 'Twilight whispers the monkeys to sleep',
        icon: '🌇',
        elements: ['cloud cloud-1', 'cloud cloud-2', 'cloud cloud-3', 'cloud cloud-4', 'cloud cloud-5', 'cloud cloud-6', 'cloud cloud-7', 'sky-glow', 'sparkle sparkle-1', 'sparkle sparkle-2', 'sparkle sparkle-3', 'sparkle sparkle-4']
      },
      night: {
        caption: 'Stars hush the bananas to dreamland',
        icon: '🌙',
        elements: ['star star-1', 'star star-2', 'star star-3', 'star star-4', 'star star-5', 'star star-6', 'star star-7', 'star star-8', 'star star-9', 'star star-10', 'star star-11', 'star star-12', 'star star-13', 'star star-14', 'star star-15', 'sky-moon-ring', 'shooting-star shooting-star-1', 'shooting-star shooting-star-2', 'shooting-star shooting-star-3', 'sparkle sparkle-1', 'sparkle sparkle-2', 'sparkle sparkle-3', 'sparkle sparkle-4', 'sparkle sparkle-5']
      }
    };
    const SKY_THEME_CLASSES = ['sky-theme-morning', 'sky-theme-afternoon', 'sky-theme-evening', 'sky-theme-night'];

    const baseFunnyMessages = [
      "The monkey got tired of counting bananas... 🍌",
      "Taking a banana break! 🍌😴",
      "Even monkeys need rest sometimes... 🐵",
      "Counting bananas is exhausting work! 🍌💤",
      "The monkey is dreaming of infinite bananas... 🍌✨",
      "Zzz... too many bananas to count... 🍌",
      "Monkey's on a banana vacation! 🏖️🍌",
      "The banana counter needs a nap! 🐵💤"
    ];

    const bananaFacts = [
      "Did you know? Bananas are berries! 🍌",
      "Banana fact: They float in water! 🍌💧",
      "Fun fact: Bananas are 75% water! 🍌",
      "Bananas contain natural mood enhancers! 🍌😊",
      "Did you know? Bananas can help you sleep! 🍌😴",
      "Banana fact: They're rich in potassium! 🍌",
      "Fun fact: Bananas grow on plants, not trees! 🍌🌱"
    ];

    const getMotivationalMessages = () => {
      const messages = [];

      if (this.streak >= 10) {
        messages.push("🔥 You're on fire! Amazing streak! 🔥");
        messages.push("🔥 Unstoppable! Keep it going! 🔥");
      } else if (this.streak >= 5) {
        messages.push("⭐ Great streak! You're doing awesome! ⭐");
        messages.push("🌟 Hot streak! Keep counting! 🌟");
      } else if (this.streak > 0) {
        messages.push("💪 Nice streak! Keep it up! 💪");
      }

      if (this.bestStreak >= 20) {
        messages.push("🏆 Legendary player! Incredible best streak! 🏆");
      } else if (this.bestStreak >= 10) {
        messages.push("⭐ Impressive best streak! You're a pro! ⭐");
      }

      if (this.sessionPoints >= 500) {
        messages.push("🎉 Incredible session! So many points! 🎉");
      } else if (this.sessionPoints >= 200) {
        messages.push("✨ Great progress! Keep it up! ✨");
      } else if (this.sessionPoints > 0) {
        messages.push("🍌 Nice work! Every banana counts! 🍌");
      }

      if (this.currentLevel >= 10) {
        messages.push("📈 High level player! You're a master! 📈");
      } else if (this.currentLevel >= 5) {
        messages.push("🚀 Leveling up! Great progress! 🚀");
      }

      return messages;
    };

    const getTimeOfDayInfo = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) return { greeting: 'Good morning', period: 'morning' };
      if (hour >= 12 && hour < 17) return { greeting: 'Good afternoon', period: 'afternoon' };
      if (hour >= 17 && hour < 21) return { greeting: 'Good evening', period: 'evening' };
      return { greeting: 'Good night', period: 'night' };
    };

    const buildFunnyMessages = () => {
      const { greeting } = getTimeOfDayInfo();
      const motivational = getMotivationalMessages();

      return [
        ...baseFunnyMessages,
        ...motivational,
        ...bananaFacts,
        `${greeting}! Time for a banana break! 🍌`,
        `${greeting}! The monkey is power napping. 🐵💤`,
        `${greeting}! Banana dreams loading... 🍌✨`
      ];
    };

    let funnyMessages = buildFunnyMessages();

    let currentMessageIndex = 0;
    let messageRotationInterval = null;
    let inactivityTimer = null;
    let isScreensaverActive = false;
    const applySkyTheme = () => {
      if (!skyContainer) return;
      const { period } = getTimeOfDayInfo();
      const theme = skyThemes[period] || skyThemes.night;

      skyContainer.classList.remove(...SKY_THEME_CLASSES);

      skyContainer.classList.add(`sky-theme-${period}`);

      const uniqueElements = ['sky-glow', 'sky-moon-ring', 'sky-sun-rays'];
      const repeatingElements = theme.elements.filter(cls => {
        const isUnique = uniqueElements.some(unique => cls.includes(unique));
        const isSparkle = cls.includes('sparkle');
        const isShootingStar = cls.includes('shooting-star');
        return !isUnique && !isSparkle && !isShootingStar;
      });
      const uniqueElementClasses = theme.elements.filter(cls => uniqueElements.some(unique => cls.includes(unique)));
      const sparkleElements = theme.elements.filter(cls => cls.includes('sparkle'));
      const shootingStarElements = theme.elements.filter(cls => cls.includes('shooting-star'));

      const decorativeElements = repeatingElements
        .map(cls => `<span class="sky-element ${cls}"></span>`)
        .join('');

      const sparklesHTML = sparkleElements
        .map(cls => `<span class="sky-sparkle ${cls}"></span>`)
        .join('');

      const shootingStarsHTML = shootingStarElements
        .map(cls => `<span class="sky-shooting-star ${cls}"></span>`)
        .join('');

      const uniqueElementsHTML = uniqueElementClasses
        .map(cls => {
          if (cls === 'sky-glow') {
            return '<span class="sky-glow"></span>';
          } else if (cls === 'sky-moon-ring') {
            return '<span class="sky-moon-ring"></span>';
          } else if (cls === 'sky-sun-rays') {
            return '<span class="sky-sun-rays"></span>';
          }
          return '';
        })
        .join('');

      skyContainer.innerHTML = `
        ${uniqueElementsHTML}
        ${decorativeElements}
        ${sparklesHTML}
        ${shootingStarsHTML}
        <div class="sky-icon">${theme.icon}</div>
      `;
    };

    const refreshFunnyMessages = () => {
      funnyMessages = buildFunnyMessages();
      currentMessageIndex = 0;
      if (messageEl) {
        messageEl.style.opacity = '1';
        messageEl.textContent = funnyMessages[0];
      }
      applySkyTheme();
    };


    const rotateMessage = () => {
      if (!messageEl || !isScreensaverActive) return;
      currentMessageIndex = (currentMessageIndex + 1) % funnyMessages.length;
      messageEl.style.opacity = '0';
      messageEl.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        messageEl.textContent = funnyMessages[currentMessageIndex];
        messageEl.style.transform = 'translateY(10px)';
        requestAnimationFrame(() => {
          messageEl.style.opacity = '1';
          messageEl.style.transform = 'translateY(0)';
        });
      }, 400);
    };

    const showScreensaver = () => {
      if (isScreensaverActive || document.hidden) return;

      isScreensaverActive = true;

      refreshFunnyMessages();

      screensaver.classList.remove('hidden');

      requestAnimationFrame(() => {
        screensaver.style.opacity = '1';
      });

      if (this.sounds && this.sounds.monkey && this.soundEnabled) {
        try {
          const monkeySound = this.sounds.monkey.cloneNode();
          monkeySound.volume = this.sfxVolume / 100;
          monkeySound.play().catch(() => { });
        } catch (e) { }
      }

      messageRotationInterval = setInterval(rotateMessage, 4000);
    };

    const hideScreensaver = () => {
      if (!isScreensaverActive) return;

      isScreensaverActive = false;

      screensaver.style.opacity = '0';

      if (messageRotationInterval) {
        clearInterval(messageRotationInterval);
        messageRotationInterval = null;
      }

      if (bananaContainer) {
        bananaContainer.innerHTML = '';
      }

      setTimeout(() => {
        if (!isScreensaverActive) {
          screensaver.classList.add('hidden');
        }
      }, 700);
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }

      hideScreensaver();

      inactivityTimer = setTimeout(() => {
        if (!document.hidden && !isScreensaverActive) {
          showScreensaver();
        }
      }, INACTIVITY_TIMEOUT);
    };

    const activities = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'touchmove',
      'click'
    ];

    activities.forEach(activity => {
      document.addEventListener(activity, resetInactivityTimer, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
        hideScreensaver();
      } else {
        resetInactivityTimer();
      }
    });

    resetInactivityTimer();
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      const key = (typeof e.key === 'string') ? e.key : '';
      const t = e.target;
      const isTypingTarget =
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true);

      if (key === 'Enter') {
        const celebration = document.getElementById('celebration');
        if (celebration && !celebration.classList.contains('hidden')) {
          e.preventDefault();
          this.hideCelebration();
          return;
        }

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

      if (e.key === '/' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        this.showTutorial(30);
        e.preventDefault();
      }

      if (key.toLowerCase() === 'h' && !isTypingTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.getHint();
        return;
      }
    });

    document.getElementById('soundToggle')?.addEventListener('change', () => this.toggleSound());
    document.getElementById('musicToggle')?.addEventListener('change', () => this.toggleMusic());
    document.getElementById('darkToggle')?.addEventListener('change', (e) => {
      this.setTheme(e.target.checked);
      const user = this.auth?.currentUser;
      if (user && !user.isAnonymous) {
        this.claimAchievement('TOGGLE_THEME');
      }
    });
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
    this.setTheme(localStorage.getItem('themeMode') === 'dark');

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

    this._updateMuteIcon();

    const darkToggle = document.getElementById('darkToggle');
    if (darkToggle) darkToggle.checked = (localStorage.getItem('themeMode') === 'dark');

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
      'assets/audio/sfx/level up.mp3',
      'assets/audio/music/music-default yellow.mp3',
      'assets/audio/music/music-jungle adventure.mp3',
      'assets/audio/music/music-monochromatic.mp3',
      'assets/audio/music/music-neon nights.mp3'
    ];
    let loaded = 0;
    let wasHidden = false;
    let hiddenStartTime = null;
    let forceCompleteTimeout = null;

    const updateLoader = () => {
      const percent = Math.round((loaded / assets.length) * 100);
      const loaderText = document.getElementById('loaderText');
      const loaderBar = document.getElementById('loaderBar');
      if (loaderText) loaderText.textContent = `Peeling bananas… ${percent}%`;
      if (loaderBar) loaderBar.style.width = `${percent}%`;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        hiddenStartTime = Date.now();
      } else if (wasHidden && hiddenStartTime) {
        const hiddenDuration = Date.now() - hiddenStartTime;
        this.loaderStart += hiddenDuration;
        wasHidden = false;
        hiddenStartTime = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const forceComplete = () => {
      if (loaded < assets.length) {
        loaded = assets.length;
        updateLoader();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (forceCompleteTimeout) clearTimeout(forceCompleteTimeout);
      this.completeLoader();
    };

    forceCompleteTimeout = setTimeout(forceComplete, 10000);

    updateLoader();

    const promises = assets.map(url => {
      return new Promise(resolve => {
        const assetTimeout = setTimeout(() => {
          loaded++;
          updateLoader();
          resolve();
        }, 3000);

        if (/\.(png|jpe?g|gif)$/i.test(url)) {
          const img = new Image();
          img.onload = img.onerror = () => {
            clearTimeout(assetTimeout);
            loaded++;
            updateLoader();
            resolve();
          };
          img.src = url;
        } else if (/\.(mp3|wav|ogg)$/i.test(url)) {
          const audio = new Audio();
          const finish = () => {
            clearTimeout(assetTimeout);
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
            clearTimeout(assetTimeout);
            loaded++;
            updateLoader();
            resolve();
          });
        }
      });
    });

    await Promise.all(promises);

    if (forceCompleteTimeout) {
      clearTimeout(forceCompleteTimeout);
      forceCompleteTimeout = null;
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    this.completeLoader();
  }

  completeLoader() {
    const elapsed = performance.now() - this.loaderStart;
    const wait = Math.max(0, this.LOADER_MIN_MS - elapsed);

    const proceed = () => {
      const loaderText = document.getElementById('loaderText');
      if (loaderText) loaderText.textContent = 'Verifying session...';
      this._setupAutoMusicGestureOnce();
      this._tryStartBgm();
      this.authManager.verifySessionAndShowUI(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        if (localStorage.getItem('tourDone') !== '1') {
          setTimeout(() => this.showTutorial(30), 400);
        }
      });
    };

    if (document.hidden) {
      setTimeout(proceed, wait);
    } else {
      if (wait > 0) {
        setTimeout(() => {
          requestAnimationFrame(proceed);
        }, wait);
      } else {
        requestAnimationFrame(proceed);
      }
    }
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

    this._updateMuteIcon();
  }

  safeStartMusic() {
    if (!this.musicEnabled) return;
    this._tryStartBgm();
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastIcon || !toastMessage) return;

    if (toastMessage.innerHTML && toastMessage.innerHTML.includes('<button')) {
      return;
    }

    if (this._resetToastTimeout) {
      return;
    }

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      this._toastTimeout = null;
    }

    switch (type) {
      case 'success': toastIcon.textContent = '✅'; break;
      case 'error': toastIcon.textContent = '❌'; break;
      case 'warning': toastIcon.textContent = '⚠️'; break;
      default: toastIcon.textContent = 'ℹ️';
    }
    toastMessage.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
      this._toastTimeout = null;
    }, duration);
  }

  setButtonBusy(button, busy) {
    if (!button) return;

    if (button.dataset.locked === 'true') {
      button.disabled = true;
      return;
    }

    if (busy) {
      if (button.dataset.busy === 'true') return;
      button.dataset.busy = 'true';
    } else {
      delete button.dataset.busy;
    }

    button.disabled = busy;
    if (busy) {
      button.classList.add('opacity-75', 'pointer-events-none');
      const originalHtml = button.dataset.originalHtml || button.innerHTML;
      if (!button.dataset.originalHtml) button.dataset.originalHtml = originalHtml;
      button.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span>${originalHtml}`;
    } else {
      button.classList.remove('opacity-75', 'pointer-events-none');
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
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
    this._updateMuteIcon();
  }

  _updateMuteIcon() {
    const bothEnabled = this.soundEnabled && this.musicEnabled;
    const icon = bothEnabled ? '🔊' : '🔇';
    const muteIcon = document.getElementById('muteIcon');
    if (muteIcon) muteIcon.textContent = icon;
    const mobileMuteIcon = document.getElementById('mobileMuteIcon');
    if (mobileMuteIcon) mobileMuteIcon.textContent = icon;
  }

  toggleMute() {
    const bothEnabled = this.soundEnabled && this.musicEnabled;

    if (bothEnabled) {
      this.soundEnabled = false;
      this.musicEnabled = false;
      localStorage.setItem('soundEnabled', 'false');
      localStorage.setItem('musicEnabled', 'false');

      const soundToggle = document.getElementById('soundToggle');
      if (soundToggle) soundToggle.checked = false;
      const musicToggle = document.getElementById('musicToggle');
      if (musicToggle) musicToggle.checked = false;

      const bgm = this.sounds?.bgm;
      if (bgm) bgm.pause();
      this._bgmIsPlaying = false;

      this._updateMuteIcon();
      this.showToast('🔇 All sounds muted', 'warning');
    } else {
      this.soundEnabled = true;
      this.musicEnabled = true;
      localStorage.setItem('soundEnabled', 'true');
      localStorage.setItem('musicEnabled', 'true');

      const soundToggle = document.getElementById('soundToggle');
      if (soundToggle) soundToggle.checked = true;
      const musicToggle = document.getElementById('musicToggle');
      if (musicToggle) musicToggle.checked = true;

      if (this.musicEnabled) {
        this._tryStartBgm();
      }

      this._updateMuteIcon();
      this.showToast('🔊 All sounds unmuted', 'success');
    }

    if (this.soundEnabled) {
      this.playSound('click');
    }
  }

  isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  setTheme(isDark) {
    const root = document.documentElement;
    root.classList.toggle('dark', !!isDark);
    localStorage.setItem('themeMode', isDark ? 'dark' : 'light');

    const chk = document.getElementById('darkToggle');
    if (chk && chk.checked !== isDark) chk.checked = isDark;

    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = isDark ? '🌙' : '🌞';

    if (typeof setThemeIcons === 'function') setThemeIcons();
  }

  toggleTheme() {
    const wasDark = this.isDarkMode();
    this.setTheme(!wasDark);
    this.playSound('click');

    const isDark = this.isDarkMode();
    if (isDark) {
      this.showToast('🌙 Dark mode enabled', 'success');
    } else {
      this.showToast('🌞 Light mode enabled', 'success');
    }

    const user = this.auth?.currentUser;
    if (user && !user.isAnonymous) {
      this.claimAchievement('TOGGLE_THEME');
    }
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
    localStorage.setItem('gameDifficulty', this.difficulty);
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
    localStorage.setItem('gameSkin', this.currentSkin);

    const newTrack = this.BGM_TRACKS[this.currentSkin] || this.BGM_TRACKS[''];
    if (this.sounds.bgm) {
      this.sounds.bgm.pause();
      this.sounds.bgm.currentTime = 0;
    }
    this._bgmIsPlaying = false;
    this.sounds.bgm = new Audio(newTrack);
    this.sounds.bgm.loop = true;
    this.sounds.bgm.volume = Math.min(1, (this.musicVolume || 0) / 100);
    if (this.musicEnabled) {
      this._tryStartBgm();
    }

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

    const showFloatingControls = sectionId !== 'menuSection' && sectionId !== 'settingsSection';
    const floatingControls = document.getElementById('floatingControls');
    if (floatingControls) floatingControls.classList.toggle('hidden', !showFloatingControls);

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

    this.currentLevel = 1;
    this.puzzlesCompleted = 0;
    this.lastAnnouncedTierLabel = null;
    this._pendingClassicTimerRestart = false;

    this.startLevelTimer();
    this.updateProgressUI();
    this.initializeGameSession();
    this.loadPuzzle();
  }

  getLevelTier() {
    let levelPointer = this.currentLevel;
    for (const tier of CLASSIC_LEVEL_TIERS) {
      const span = tier.levels === Infinity ? Infinity : tier.levels;
      if (span === Infinity || levelPointer <= span) {
        this.currentLevelTier = tier;
        return tier;
      }
      levelPointer -= span;
    }
    this.currentLevelTier = CLASSIC_LEVEL_TIERS[CLASSIC_LEVEL_TIERS.length - 1];
    return this.currentLevelTier;
  }

  getDifficultyTimeMultiplier() {
    if (this.difficulty === 'easy') return 1.3;
    if (this.difficulty === 'hard') return 0.85;
    return 1;
  }

  getEffectiveTierTime(tier = this.getLevelTier()) {
    const selectedTier = tier || CLASSIC_LEVEL_TIERS[0];
    const adjusted = Math.round(selectedTier.timer * this.getDifficultyTimeMultiplier());
    return Math.max(10, adjusted);
  }

  getLevelTimeLimit() {
    return this.getEffectiveTierTime();
  }

  startLevelTimer() {
    this.clearSessionTimer();
    const tier = this.getLevelTier();
    const timeLimit = this.getEffectiveTierTime(tier);
    this.levelTimeRemaining = timeLimit;
    this.levelStartTime = Date.now();
    this.updateDifficultyLabel(tier);
    this.updateSessionTimerBar();
    this.announceDifficultyTier();

    const sessionTimeEl = document.getElementById('sessionTime');
    if (sessionTimeEl) sessionTimeEl.classList.remove('hidden');

    this.sessionTimerInterval = setInterval(() => {
      if (this.paused) {
        return;
      }

      this.levelTimeRemaining--;
      this.updateSessionTimerBar();
      if (this.levelTimeRemaining <= 0) {
        this.clearSessionTimer();
        this.lives--;
        this.updateLivesUI();
        this.showScorePopup('Life -1', '#d32f2f');

        if (this.lives <= 0) {
          this.endClassicSession('💔 Out of lives!');
        } else {
          this._pendingClassicTimerRestart = true;
          this.loadPuzzle();
        }
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

    if (data && data.question && typeof data.solution === 'number') {
      return data;
    }

    const fetched = await this.fetchBananaPuzzle();
    const payload = { question: fetched.imageUrl, solution: fetched.answer };

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

  updateDifficultyLabel(tier) {
    const info = tier || this.getLevelTier();
    const labelEl = document.getElementById('difficultyLabel');
    if (labelEl && info) {
      labelEl.textContent = `${info.label} • ${this.getEffectiveTierTime(info)}s`;
    }
  }

  announceDifficultyTier(force = false) {
    const tier = this.getLevelTier();
    if (!tier) return;
    const isFirst = !this.lastAnnouncedTierLabel;
    if (!force && !isFirst && tier.label === this.lastAnnouncedTierLabel) return;
    this.lastAnnouncedTierLabel = tier.label;
    const prefix = isFirst ? 'Difficulty' : 'Difficulty Up';
    this.showDifficultyBanner(`${prefix}: ${tier.label} (${this.getEffectiveTierTime(tier)}s)`);
  }

  showDifficultyBanner(message) {
    const banner = document.getElementById('difficultyChangeBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.classList.remove('hidden');
    requestAnimationFrame(() => {
      banner.classList.remove('opacity-0', '-translate-y-1');
    });
    clearTimeout(this._difficultyBannerTimeout);
    this._difficultyBannerTimeout = setTimeout(() => {
      banner.classList.add('opacity-0', '-translate-y-1');
      setTimeout(() => {
        banner.classList.add('hidden');
      }, 300);
    }, 2200);
  }

  updateSessionTimerBar() {
    const bar = document.getElementById('timerBar');
    if (!bar) return;

    const timeLimit = this.getLevelTimeLimit();
    const pct = Math.max(0, Math.min(100, (this.levelTimeRemaining / timeLimit) * 100));
    bar.style.width = pct + '%';
    bar.style.background = pct <= 30
      ? 'linear-gradient(90deg,#ff9800,#f44336)'
      : 'linear-gradient(90deg,#81c784,#4caf50)';
    const label = document.getElementById('sessionTime');
    if (label) label.textContent = `${this.levelTimeRemaining}s`;
  }

  endClassicSession(reasonText) {
    this.clearSessionTimer();
    this.clearGameTimer();

    this.currentSessionRef = null;

    const summary = `Final Score: ${this.sessionPoints} pts • Puzzles: ${this.puzzlesCompleted} • Level: ${this.currentLevel}`;
    this.showGameOverModal(reasonText, summary);

    this.showToast(`Game Over — ${reasonText}`, 'warning', 1800);
  }

  async checkLevelUp() {
    const previousTier = this.getLevelTier();
    const expectedLevel = Math.floor(this.puzzlesCompleted / 5) + 1;
    const result = {
      leveledUp: false,
      tierChanged: false,
      previousTier,
      newTier: previousTier
    };

    if (expectedLevel > this.currentLevel) {
      this.currentLevel = expectedLevel;

      const levelBonus = this.currentLevel * 50;
      this.sessionPoints += levelBonus;

      this.startLevelTimer();

      const newTier = this.getLevelTier();
      result.leveledUp = true;
      result.newTier = newTier;
      result.tierChanged = (newTier?.label || '') !== (previousTier?.label || '');

      if (result.tierChanged) {
        this.lives = this.maxLives;
        this.updateLivesUI();
        this.playSound('levelup');
      }

      const toastSuffix = result.tierChanged
        ? ` • Difficulty Up (${newTier?.label || 'New'}) • Lives Restored!`
        : '';
      this.showToast(`🎊 LEVEL ${this.currentLevel}! +${levelBonus} pts${toastSuffix}`, 'success', 3000);
      this.updateProgressUI();

      await this.updateHighestLevelAndTier(this.currentLevel, newTier);
    }

    return result;
  }

  async updateHighestLevelAndTier(level, tier) {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const userRef = this.db.ref('users/' + user.uid);
      const snap = await userRef.once('value');
      const curr = snap.val() || {};

      const updates = {};

      const highestLevel = curr.highestLevel || 0;
      if (level > highestLevel) {
        updates.highestLevel = level;
      }

      if (tier && tier.label) {
        const tierOrder = CLASSIC_LEVEL_TIERS.findIndex(t => t.label === tier.label);
        const currentHighestTierLabel = curr.highestTier || '';
        const currentHighestTierOrder = CLASSIC_LEVEL_TIERS.findIndex(t => t.label === currentHighestTierLabel);

        if (currentHighestTierOrder === -1 || tierOrder > currentHighestTierOrder) {
          updates.highestTier = tier.label;
        }
      }

      if (Object.keys(updates).length > 0) {
        await userRef.update(updates);
      }
    } catch (error) {
      console.error('Failed to update highest level/tier:', error);
    }
  }

  updateProgressUI() {
    const levelEl = document.getElementById('currentLevel');
    const puzzleProgressEl = document.getElementById('puzzleProgress');
    if (levelEl) levelEl.textContent = this.currentLevel;
    if (puzzleProgressEl) {
      const puzzlesInLevel = this.puzzlesCompleted % 5;
      puzzleProgressEl.textContent = `${puzzlesInLevel}/5`;
    }
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
      try { await navigator.share(shareData); return; } catch (_) { }
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
    if (resultEl) resultEl.innerHTML = '';
    const loadingOverlay = document.getElementById('puzzleLoadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';

    try {
      const puzzleData = await this.fetchBananaPuzzle();
      if (puzzleData.imageUrl && puzzleData.answer !== undefined) {
        this.currentPuzzleAnswer = puzzleData.answer;
        const img = document.getElementById('puzzleImage');
        img.classList.remove('fade-in');
        const preImg = new window.Image();
        preImg.onload = () => {
          img.src = puzzleData.imageUrl;
          img.alt = 'Banana counting puzzle';
          setTimeout(() => img.classList.add('fade-in'), 50);
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          if (resultEl) resultEl.textContent = '';
          if (this.gameMode !== 'classic') {
            this.startTimer();
          } else if (this._pendingClassicTimerRestart) {
            this.startLevelTimer();
            this._pendingClassicTimerRestart = false;
          }
          this.focusGuess();
        };
        preImg.onerror = () => {
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          if (resultEl) resultEl.textContent = 'Failed to load puzzle image.';
          this.showToast('⚠️ Puzzle image failed to load — retrying in 2s', 'warning');
          setTimeout(() => this.loadPuzzle(), 2000);
        };
        preImg.src = puzzleData.imageUrl;
      } else {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        if (resultEl) resultEl.textContent = 'Failed to load puzzle from API.';
        this.showToast('⚠️ Puzzle load failed — retrying in 2s', 'warning');
        setTimeout(() => this.loadPuzzle(), 2000);
      }
    } catch (error) {
      console.error('Puzzle loading error:', error);
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      if (resultEl) resultEl.innerHTML = '❌ Network error loading puzzle.<br><button onclick="window.game.loadPuzzle()" class="mt-2 px-3 py-1 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">Retry Now</button>';
      this.showToast('Network error. Click Retry or wait 5s', 'error', 5000);
      setTimeout(() => {
        const stillInGame = document.getElementById('gameSection');
        if (stillInGame && !stillInGame.classList.contains('hidden') && resultEl?.textContent?.includes('Network error')) {
          this.loadPuzzle();
        }
      }, 5000);
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
      this.showToast('⚠️ Banana API unavailable — using backup puzzle', 'warning', 3000);
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
    let base;
    if (this.difficulty === 'hard') {
      base = 15;
    } else if (this.difficulty === 'normal') {
      base = 20;
    } else {
      base = 30;
    }
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

    const solveTime = this.timerInterval ? ((this.getTimeLimit() - this.timeRemaining)) : 0;

    let basePoints;
    if (this.difficulty === 'hard') {
      basePoints = 15;
    } else if (this.difficulty === 'normal') {
      basePoints = 12;
    } else {
      basePoints = 10;
    }
    const hintPenalty = this.hintUsed ? 3 : 0;
    const comboMultiplier = 1 + Math.floor(this.streak / 3);

    const levelTimeLimit = this.getLevelTimeLimit();
    const timeSpent = levelTimeLimit - this.levelTimeRemaining;
    const avgTimePerPuzzle = levelTimeLimit / this.puzzlesPerLevel;
    const timeBonusMultiplier = timeSpent < avgTimePerPuzzle ? 1.5 : 1.0;

    const preClamp = Math.max(1, basePoints - hintPenalty);
    const totalPoints = Math.floor(preClamp * comboMultiplier * timeBonusMultiplier);

    const isCorrect = guess === this.currentPuzzleAnswer;

    if (guessEl) {
      guessEl.value = '';
      this.focusGuess();
    }

    if (isCorrect) {
      this.sessionCorrect++;
      this.streak++;
      this.puzzlesCompleted++;
      this.sessionPoints += totalPoints;
      this.playSound('correct');
      this.showScorePopup(`+${totalPoints} pts 🏅`);
      this.spawnConfetti();
      this.updateStatsUI();
      this.updateProgressUI();

      if (this.streak === 5) await this.claimAchievement('STREAK_5');
      if (this.streak === 10) await this.claimAchievement('STREAK_10');
      if (guess === this.currentPuzzleAnswer) await this.claimAchievement('PERFECT_GUESS');

      await this.updateUserStats(totalPoints, solveTime);

      const levelInfo = await this.checkLevelUp();
      const tier = levelInfo?.newTier;
      const difficultyNotice = (levelInfo?.tierChanged && tier)
        ? `Difficulty increased to ${tier.label} (${this.getEffectiveTierTime(tier)}s)`
        : null;
      this.triggerCelebration({ difficultyNotice });

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

      this.clearGameTimer();
      clearTimeout(this._nextPuzzleTimeout);
      this._nextPuzzleTimeout = setTimeout(() => {
        const stillInGame = document.getElementById('gameSection');
        if (stillInGame && !stillInGame.classList.contains('hidden') && this.gameMode === 'classic') {
          this.loadPuzzle();
        }
      }, 1200);
    }
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
    }
    await userRef.update(updates);
    await this.recordGameSession(points);

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

  async initializeGameSession() {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      if (!this.currentSessionRef) {
        this.currentSessionRef = this.db.ref('gameSessions').push();
        const username = this.usernameGlobal
          || user.displayName
          || (user.email ? user.email.split('@')[0] : 'Player');
        await this.currentSessionRef.set({
          userId: user.uid,
          username,
          points: 0,
          streak: 0,
          timestamp: firebase.database.ServerValue.TIMESTAMP,
          mode: this.gameMode
        });
      }
    } catch (error) {
      console.error('Failed to initialize game session:', error);
    }
  }

  async recordGameSession(points) {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      if (!this.currentSessionRef) {
        await this.initializeGameSession();
      }

      const safePoints = Math.max(0, Math.min(this.sessionPoints, 1000));
      const safeStreak = Math.max(0, Math.min(this.streak, 999));

      if (this.currentSessionRef) {
        const userNameForSession = this.usernameGlobal
          || this.auth.currentUser?.displayName
          || (this.auth.currentUser?.email ? this.auth.currentUser.email.split('@')[0] : 'Player');
        await this.currentSessionRef.update({
          username: userNameForSession,
          points: safePoints,
          streak: safeStreak
        });
      }
    } catch (error) {
      console.error('Failed to record game session:', error);
    }
  }

  updateStatsUI() {
    if (document.getElementById('streak')) document.getElementById('streak').textContent = String(this.streak);
    if (document.getElementById('combo')) document.getElementById('combo').textContent = `x${1 + Math.floor(this.streak / 3)}`;
    if (document.getElementById('sessionPts')) document.getElementById('sessionPts').textContent = String(this.sessionPoints);
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
    const loadingOverlay = document.getElementById('dailyLoadingOverlay');

    if (resultEl) resultEl.textContent = '';
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
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
        const preImg = new window.Image();
        preImg.onload = () => {
          img.src = puzzle.question;
          img.alt = 'Daily banana counting challenge';
          img.classList.remove('fade-in'); void img.offsetWidth; img.classList.add('fade-in');
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
        };
        preImg.onerror = () => {
          if (loadingOverlay) loadingOverlay.classList.add('hidden');
          this.showToast('⚠️ Puzzle image failed to load', 'warning');
        };
        preImg.src = puzzle.question;
      } else {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      }
      if (meta) meta.textContent = `Daily Challenge for ${dateKey}`;
      resultEl.textContent = '';

      await this._reflectDailySolvedState(dateKey);
    } catch (err) {
      console.error('Daily puzzle loading error:', err);
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
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
    this.initAvatarFeature();
    this.loadProfile();
  }

  async loadProfile() {
    const user = this.auth.currentUser;
    if (!user) {
      this.showToast('Please log in first', 'error');
      this.showSection('authSection');
      return;
    }

    const profileStats = document.getElementById('profileStats');
    const achList = document.getElementById('achList');

    profileStats.innerHTML = '<div class="col-span-2 md:col-span-3 text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div><p class="mt-2 text-gray-600 dark:text-gray-300">Loading profile...</p></div>';
    achList.innerHTML = '<li class="text-center text-gray-500 py-4"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div></li>';

    try {
      const userRef = this.db.ref('users/' + user.uid);
      const userSnapshot = await userRef.once('value');
      const userData = userSnapshot.val() || {};
      const avatarImg = document.getElementById('profileAvatarImg');
      const initialsCont = document.getElementById('profileInitialsContainer');
      let avatarUrl = null;
      try {
        avatarUrl = localStorage.getItem('customAvatar_' + user.uid) || userData.avatar || null;
      } catch (e) {
        avatarUrl = userData.avatar || null;
      }
      if (avatarUrl && avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = '';
        if (initialsCont) initialsCont.style.display = 'none';
      } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (initialsCont) initialsCont.style.display = '';
      }
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
      profileStats.innerHTML = '<div class="col-span-2 md:col-span-3 text-center text-red-500 py-4"><p class="mb-2">❌ Failed to load profile</p><button onclick="window.game.loadProfile()" class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">Retry</button></div>';
      achList.innerHTML = '<li class="text-center text-red-500 py-4">Failed to load achievements</li>';
      this.showToast('Failed to load profile. Please check your connection.', 'error');
    }
  }

  displayProfile(userData, achievements) {
    const accuracy = (userData.accuracy ?? null) !== null ? `${userData.accuracy}%` : '—';
    const initialsEl = document.getElementById('profileInitials');
    if (initialsEl && userData.username) {
      initialsEl.textContent = userData.username.charAt(0).toUpperCase();
    }
    window.openAvatarModal = function () {
      const modal = document.getElementById('avatarModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      window.game.renderPresetAvatars();
      const modalPreview = document.getElementById('avatarModalPreview');
      const modalInitials = document.getElementById('avatarModalPreviewInitials');
      const modalLabel = document.getElementById('avatarModalPreviewLabel');
      let avatarUrl = null;
      let username = 'U';
      try {
        const uid = (window.game.auth && window.game.auth.currentUser && window.game.auth.currentUser.uid) || null;
        avatarUrl = (uid ? userData.avatar : null) || null;
        username = (userData.username || 'U');
      } catch (e) {
        avatarUrl = userData.avatar || null;
      }
      if (avatarUrl && modalPreview) {
        modalPreview.src = avatarUrl;
        modalPreview.style.display = '';
        if (modalInitials) modalInitials.style.display = 'none';
      } else {
        if (modalPreview) modalPreview.style.display = 'none';
        if (modalInitials) {
          modalInitials.style.display = '';
          const initialsSpan = document.getElementById('avatarModalPreviewInitial');
          if (initialsSpan) initialsSpan.textContent = username.charAt(0).toUpperCase();
        }
      }
      if (modalLabel) modalLabel.textContent = 'Present Avatar';
    };
    window.closeAvatarModal = function () {
      document.getElementById('avatarModal').classList.add('hidden');
      document.getElementById('avatarModal').classList.remove('flex');
    };
    window.saveAvatarSelection = function () {
      window.game.saveAvatarSelection();
    };
    document.addEventListener('DOMContentLoaded', function () {
      const input = document.getElementById('avatarUploadInput');
      if (input) {
        input.onchange = (e) => window.game.handleAvatarUploadInput(e);
      }
      if (window.game && window.game.initAvatarFeature) {
        window.game.initAvatarFeature();
      }
    });
    const usernameEl = document.getElementById('profileUsername');
    if (usernameEl) usernameEl.textContent = userData.username || 'Player';
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = userData.email || '';
    const pbStreak = (userData.bestStreak ?? null) !== null ? userData.bestStreak : '0';
    const dailyStreakDisplay = (userData.dailyStreak ?? null) !== null ? userData.dailyStreak : '0';
    document.getElementById('profileStats').innerHTML = ` 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Total Score:</p> 
      <p class="text-gray-800 dark:text-white">${userData.totalScore || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">PB Best Streak:</p> 
      <p class="text-gray-800 dark:text-white">${pbStreak}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Daily Streak:</p> 
      <p class="text-gray-800 dark:text-white">${dailyStreakDisplay} 🔥</p> 
    </div>
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Rounds Played:</p> 
      <p class="text-gray-800 dark:text-white">${userData.gamesPlayed || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Rounds Won:</p> 
      <p class="text-gray-800 dark:text-white">${userData.gamesWon || 0}</p> 
    </div> 
    <div class="bg-yellow-50 p-4 rounded-xl dark:bg-gray-700"> 
      <p class="font-bold text-yellow-600 dark:text-yellow-400">Accuracy:</p> 
      <p class="text-gray-800 dark:text-white">${accuracy}</p> 
    </div>`;

    const highestTierEl = document.getElementById('profileHighestTier');
    const highestLevelEl = document.getElementById('profileHighestLevel');
    if (highestTierEl) {
      highestTierEl.textContent = userData.highestTier || '—';
    }
    if (highestLevelEl) {
      highestLevelEl.textContent = (userData.highestLevel ?? null) !== null ? userData.highestLevel : '—';
    }

    const achList = document.getElementById('achList');
    achList.innerHTML = '';

    const unlockedAchievementCodes = new Set(achievements.map(ach => ach.code));

    if (Object.keys(this.ACH).length === 0) {
      achList.innerHTML = '<li class="text-center text-gray-500 py-4">No achievements available yet.</li>';
      return;
    }

    const faIcons = {
      STREAK_5: 'fa-fire',
      SPEED_5: 'fa-bolt',
      PERFECT_GUESS: 'fa-lemon',
      FIRST_WIN: 'fa-trophy',
      MULTIPLAYER_WIN: 'fa-users',
      STREAK_10: 'fa-meteor',
      DAILY_STREAK_7: 'fa-calendar-week',
      FIRST_DAILY: 'fa-calendar-check',
      CHANGE_SKIN: 'fa-paint-brush',
      TOGGLE_THEME: 'fa-moon',
      GAMES_WON_50: 'fa-medal'
    };
    Object.entries(this.ACH).forEach(([code, { name, points, description }]) => {
      const isUnlocked = unlockedAchievementCodes.has(code);
      const li = document.createElement('li');
      li.className = `flex items-center space-x-3 p-3 rounded-lg ${isUnlocked
        ? 'bg-green-50 dark:bg-green-900/20'
        : 'bg-gray-100 dark:bg-gray-700/50 opacity-60'
        }`;
      let iconClass = faIcons[code] || 'fa-star';
      let iconHtml = isUnlocked
        ? `<i class=\"fas ${iconClass} achievement-badge-icon\"></i>`
        : `<i class=\"fas fa-lock achievement-badge-icon\"></i>`;
      li.innerHTML = `
        <span class=\"text-2xl flex items-center justify-center w-8\">${iconHtml}</span>
        <div>
          <p class=\"font-bold ${isUnlocked ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}\">${name}</p>
          <p class=\"text-sm ${isUnlocked ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'}\">${points} pts${description ? ` - ${description}` : ''}</p>
        </div>`;
      achList.appendChild(li);
    });
  }

  async claimAchievement(code) {
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) return;
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
    this._shuffleCelebrationImages = function () {
      this._celebrationQueue = this._celebrationImages.slice();
      for (let i = this._celebrationQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._celebrationQueue[i], this._celebrationQueue[j]] = [this._celebrationQueue[j], this._celebrationQueue[i]];
      }
    };

    const GIPHY_API_KEY = window.GIPHY_API_KEY || window.MultiplayerManager?.GIPHY_API_KEY || '';
    if (!GIPHY_API_KEY) {
      console.warn('GIPHY API key not configured. Using fallback celebration image.');
      this._celebrationImages = ['https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'];
      this._shuffleCelebrationImages();
      this._cacheCelebrationImagesBatch(0, 1);
      return;
    }

    this._celebrationImages = [];
    this._celebrationQueue = [];
    this._celebrationCache = new Map();
    this._celebrationLoadingState = {
      initialBatchLoaded: false,
      progressiveLoadingActive: false,
      batchSize: 8
    };

    fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=celebration&limit=30&rating=pg`)
      .then(res => res.json())
      .then(data => {
        if (data.data && data.data.length) {
          this._celebrationImages = data.data.map(gif => gif.images.original.url);
          this._shuffleCelebrationImages();
          
          this._cacheCelebrationImagesBatch(0, this._celebrationLoadingState.batchSize);
          this._celebrationLoadingState.initialBatchLoaded = true;
          
          setTimeout(() => {
            this._startProgressiveCelebrationLoading();
          }, 3000);
        } else {
          this._celebrationImages = ['https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'];
          this._shuffleCelebrationImages();
          this._cacheCelebrationImagesBatch(0, 1);
        }
      })
      .catch(() => {
        this._celebrationImages = ['https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'];
        this._shuffleCelebrationImages();
        this._cacheCelebrationImagesBatch(0, 1);
      });

    this._celebrationQueue = [];
    this._celebrationCache = new Map();
  }

  _cacheCelebrationImagesBatch(startIndex, count) {
    if (!this._celebrationQueue || this._celebrationQueue.length === 0) return;
    
    const endIndex = Math.min(startIndex + count, this._celebrationQueue.length);
    for (let i = startIndex; i < endIndex; i++) {
      const url = this._celebrationQueue[i];
      if (!this._celebrationCache.has(url)) {
        const img = new Image();
        img.src = url;
        this._celebrationCache.set(url, img);
      }
    }
  }

  _startProgressiveCelebrationLoading() {
    if (!this._celebrationLoadingState) return;
    if (this._celebrationLoadingState.progressiveLoadingActive) return;
    if (!this._celebrationImages || this._celebrationImages.length === 0) return;
    if (!this._celebrationLoadingState.initialBatchLoaded) return;

    this._celebrationLoadingState.progressiveLoadingActive = true;
    const batchSize = 5;
    const startIndex = this._celebrationLoadingState.batchSize;
    
    let currentIndex = startIndex;

    const loadNextBatch = () => {
      if (currentIndex >= this._celebrationQueue.length) {
        this._celebrationLoadingState.progressiveLoadingActive = false;
        return;
      }

      this._cacheCelebrationImagesBatch(currentIndex, batchSize);
      currentIndex += batchSize;

      if (currentIndex < this._celebrationQueue.length) {
        setTimeout(loadNextBatch, 2000);
      } else {
        this._celebrationLoadingState.progressiveLoadingActive = false;
      }
    };

    setTimeout(loadNextBatch, 1000);
  }

  _getNextCelebrationUrl() {
    if (!this._celebrationQueue || this._celebrationQueue.length === 0) {
      this.initCelebrations();
    }
    const url = this._celebrationQueue.shift();
    this._celebrationQueue.push(url);
    return url;
  }

  async triggerCelebration({ autoHideMs = 2500, difficultyNotice = null } = {}) {
    const wrap = document.getElementById('celebration');
    const imgEl = document.getElementById('celebrationGif');
    const diffEl = document.getElementById('celebrationDifficultyNotice');

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
        probe.onload = () => {
          if (this._celebrationCache && !this._celebrationCache.has(candidate)) {
            this._celebrationCache.set(candidate, probe);
          }
          res(true);
        };
        probe.onerror = () => res(false);
        probe.src = candidate;
      });
      if (ok) {
        chosen = candidate;
        break;
      }
    }

    if (this._celebrationQueue && this._celebrationQueue.length > 0 && this._celebrationCache) {
      const nextUrls = this._celebrationQueue.slice(0, 3).filter(url => !this._celebrationCache.has(url));
      nextUrls.forEach(url => {
        const img = new Image();
        img.src = url;
        this._celebrationCache.set(url, img);
      });
    }

    imgEl.src = chosen || 'assets/images/logo.png';
    imgEl.onerror = function () { this.src = 'assets/images/logo.png'; };

    if (diffEl) {
      if (difficultyNotice) {
        diffEl.textContent = difficultyNotice;
        diffEl.classList.remove('hidden');
      } else {
        diffEl.textContent = '';
        diffEl.classList.add('hidden');
      }
    }

    if (autoHideMs && wrap) {
      clearTimeout(this._celebrationHideT);
      this._celebrationHideT = setTimeout(() => {
        wrap.classList.add('hidden');
        if (this.gameMode === 'classic') {
          this.loadPuzzle();
        }
      }, autoHideMs);
    }
  }

  hideCelebration() {

    if (this._isHidingCelebration) {
      return;
    }
    this._isHidingCelebration = true;

    clearTimeout(this._nextPuzzleTimeout);
    clearTimeout(this._celebrationHideT);
    document.getElementById('celebration').classList.add('hidden');
    document.getElementById('celebrationGif').src = '';

    this.loadPuzzle();

    setTimeout(() => {
      this._isHidingCelebration = false;
    }, 500);
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

    this.currentSessionRef = null;

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
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastIcon || !toastMessage) return;

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      this._toastTimeout = null;
    }

    toastIcon.textContent = '⚠️';
    toastMessage.innerHTML = `Are you sure you want to reset all local progress? <br><span class='text-xs opacity-80'>This cannot be undone.</span><br><button id='resetConfirmBtn' class='mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-xl transition-all shadow-md text-xs'>Reset</button> <button id='resetCancelBtn' class='mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-1 px-3 rounded-xl transition-all text-xs ml-2'>Cancel</button>`;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');

    let toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
      toastMessage.textContent = '';
      if (this._resetToastTimeout === toastTimeout) {
        this._resetToastTimeout = null;
      }
    }, 30000);

    this._resetToastTimeout = toastTimeout;

    let resetBtn, cancelBtn;

    const cleanup = () => {
      clearTimeout(toastTimeout);
      if (this._resetToastTimeout === toastTimeout) {
        this._resetToastTimeout = null;
      }
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
      if (resetBtn) resetBtn.removeEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      toastMessage.textContent = '';
    };
    const onConfirm = () => {
      localStorage.clear();
      localStorage.setItem('themeMode', 'light');
      localStorage.setItem('soundEnabled', 'true');
      localStorage.setItem('sfxVolume', '40');
      localStorage.setItem('musicEnabled', 'true');
      localStorage.setItem('musicVolume', '45');
      localStorage.setItem('highContrast', 'false');
      localStorage.setItem('largeText', 'false');
      localStorage.setItem('reducedMotion', 'false');
      localStorage.setItem('gameDifficulty', 'normal');
      localStorage.setItem('gameSkin', '');

      this.soundEnabled = true;
      this.musicEnabled = true;
      this.difficulty = 'normal';
      this.currentSkin = '';
      this.sfxVolume = 40;
      this.musicVolume = 45;

      Object.values(this.sounds).forEach(snd => {
        if (snd !== this.sounds.bgm) {
          snd.volume = this.sfxVolume / 100;
        }
      });
      if (this.sounds?.bgm) {
        this.sounds.bgm.volume = Math.min(1, this.musicVolume / 100);
      }

      document.body.classList.remove('high-contrast', 'large-text', 'reduced-motion');

      const soundToggle = document.getElementById('soundToggle');
      if (soundToggle) soundToggle.checked = true;
      const musicToggle = document.getElementById('musicToggle');
      if (musicToggle) musicToggle.checked = true;

      const hcToggle = document.getElementById('hcToggle');
      const largeToggle = document.getElementById('largeToggle');
      const rmToggle = document.getElementById('rmToggle');

      if (hcToggle) {
        hcToggle.checked = false;
      }
      if (largeToggle) {
        largeToggle.checked = false;
      }
      if (rmToggle) {
        rmToggle.checked = false;
      }

      localStorage.setItem('highContrast', 'false');
      localStorage.setItem('largeText', 'false');
      localStorage.setItem('reducedMotion', 'false');

      const sfx = document.getElementById('sfxVolume');
      const sfxLabel = document.getElementById('sfxVolumeValue');
      if (sfx) {
        sfx.value = 40;
        sfx.disabled = false;
        sfx.removeAttribute('readonly');
      }
      if (sfxLabel) sfxLabel.textContent = '40%';

      const mv = document.getElementById('musicVolume');
      const mvLabel = document.getElementById('musicVolumeValue');
      if (mv) {
        mv.value = 45;
      }
      if (mvLabel) mvLabel.textContent = '45%';

      const diffSelect = document.getElementById('difficultySelect');
      if (diffSelect) diffSelect.value = 'normal';
      const skinSelect = document.getElementById('skinSelect');
      if (skinSelect) skinSelect.value = '';
      const mobileThemeIcon = document.getElementById('mobileThemeIcon');
      if (mobileThemeIcon) mobileThemeIcon.textContent = '🌞';
      const mobileThemeToggle = document.getElementById('mobileThemeToggle');
      if (mobileThemeToggle) mobileThemeToggle.setAttribute('data-theme', 'light');

      this.applySavedSettings();

      const hcToggleFinal = document.getElementById('hcToggle');
      const largeToggleFinal = document.getElementById('largeToggle');
      const rmToggleFinal = document.getElementById('rmToggle');
      if (hcToggleFinal) {
        hcToggleFinal.checked = false;
      }
      if (largeToggleFinal) {
        largeToggleFinal.checked = false;
      }
      if (rmToggleFinal) {
        rmToggleFinal.checked = false;
      }
      document.body.classList.remove('high-contrast', 'large-text', 'reduced-motion');
      localStorage.setItem('highContrast', 'false');
      localStorage.setItem('largeText', 'false');
      localStorage.setItem('reducedMotion', 'false');

      this.changeSkin();

      cleanup();

      setTimeout(() => {
        this.showToast('✅ All settings have been reset to default values', 'success', 4000);
      }, 100);
    };
    const onCancel = () => {
      this.showToast('Reset cancelled', 'info');
      cleanup();
    };
    setTimeout(() => {
      resetBtn = document.getElementById('resetConfirmBtn');
      cancelBtn = document.getElementById('resetCancelBtn');
      if (resetBtn) resetBtn.addEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    }, 50);
  }

  exportData() {
    const data = {
      settings: {
        theme: localStorage.getItem('themeMode'),
        soundEnabled: localStorage.getItem('soundEnabled'),
        sfxVolume: localStorage.getItem('sfxVolume'),
        highContrast: localStorage.getItem('highContrast'),
        largeText: localStorage.getItem('largeText'),
        reducedMotion: localStorage.getItem('reducedMotion'),
        difficulty: localStorage.getItem('gameDifficulty'),
        skin: localStorage.getItem('gameSkin'),
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

window.toggleMute = () => {
  if (window.game?.toggleMute) {
    window.game.toggleMute();
  }
};

window.toggleTheme = () => {
  if (window.game?.toggleTheme) {
    window.game.toggleTheme();
  } else {
    const isDark = document.documentElement.classList.contains('dark');
    const newIsDark = !isDark;
    document.documentElement.classList.toggle('dark', newIsDark);
    localStorage.setItem('themeMode', newIsDark ? 'dark' : 'light');

    const themeIcon = document.getElementById('themeIcon');
    const mobileThemeIcon = document.getElementById('mobileThemeIcon');
    if (themeIcon) themeIcon.textContent = newIsDark ? '🌙' : '🌞';
    if (mobileThemeIcon) mobileThemeIcon.textContent = newIsDark ? '🌙' : '🌞';

    const chk = document.getElementById('darkToggle');
    if (chk && chk.checked !== newIsDark) chk.checked = newIsDark;

    window.dispatchEvent(new CustomEvent('themechange', { detail: { isDark: newIsDark } }));
  }
};
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
window.playOnline = () => window.game.multiplayerManager.playOnline();
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

window.loginWithGoogle = (mode) => window.game.authManager.loginWithGoogle(mode);
window.openChangePasswordModal = () => window.game.authManager.openChangePasswordModal();
window.closeChangePasswordModal = () => window.game.authManager.closeChangePasswordModal();
window.submitChangePasswordModal = () => window.game.authManager.submitChangePasswordModal();
window.linkGoogleAccount = () => window.game.authManager.linkGoogleAccount();
window.openAccountRecovery = () => window.game.authManager.openAccountRecovery();
window.closeAccountRecovery = () => window.game.authManager.closeAccountRecovery();
window.recoverUsernameFromEmail = () => window.game.authManager.recoverUsernameFromEmail();
window.recoverEmailFromUsername = () => window.game.authManager.recoverEmailFromUsername();
window.sendRecoveryPasswordEmail = () => window.game.authManager.sendRecoveryPasswordEmail();

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

