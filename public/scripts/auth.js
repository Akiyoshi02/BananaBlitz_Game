window.toggleTheme = () => window.game.toggleTheme();
window.toggleSound = () => window.game.toggleSound();
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

class AuthManager {
  constructor(game) {
    this.game = game;
    this.auth = game.auth;
    this.db = game.db;
    this.setupAuthListener();
  }

  toKeyUsername(name) {
    return (name || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  _isValidVisibleUsername(name) {
    return /^[a-zA-Z0-9_.\- ]{3,20}$/.test(name || "");
  }

  _updateCUStatus({ state, message }) {
    const statusEl = document.getElementById('cu-status');
    const saveBtn = document.getElementById('cu-save');
    if (!statusEl || !saveBtn) return;

    statusEl.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-yellow-600', 'dark:text-green-400', 'dark:text-red-400', 'dark:text-yellow-400');

    let canSave = false;

    switch (state) {
      case 'checking':
        statusEl.textContent = message || 'Checking…';
        statusEl.classList.add('text-yellow-600', 'dark:text-yellow-400');
        canSave = false;
        break;
      case 'invalid':
        statusEl.textContent = message || 'Invalid format.';
        statusEl.classList.add('text-red-600', 'dark:text-red-400');
        canSave = false;
        break;
      case 'taken':
        statusEl.textContent = message || 'This username is already taken.';
        statusEl.classList.add('text-red-600', 'dark:text-red-400');
        canSave = false;
        break;
      case 'same':
        statusEl.textContent = message || 'That’s already your current username.';
        statusEl.classList.add('text-yellow-600', 'dark:text-yellow-400');
        canSave = false;
        break;
      case 'available':
        statusEl.textContent = message || 'Available ✓';
        statusEl.classList.add('text-green-600', 'dark:text-green-400');
        canSave = true;
        break;
      default:
        statusEl.classList.add('hidden');
    }

    saveBtn.disabled = !canSave;
  }

  _bindCUInputHandler() {
    const input = document.getElementById('cu-input');
    if (!input) return;

    if (this._cu_onInput) input.removeEventListener('input', this._cu_onInput);
    clearTimeout(this._cu_debounceTimer);

    this._cu_onInput = () => {
      const proposedVisible = (input.value || '').trim();

      if (!proposedVisible) {
        this._updateCUStatus({ state: null });
        return;
      }

      const proposedKey = this.toKeyUsername(proposedVisible);

      if (proposedKey === this._cu_originalKey) {
        this._updateCUStatus({ state: 'same', message: 'That’s already your username.' });
        return;
      }

      if (!this._isValidVisibleUsername(proposedVisible)) {
        this._updateCUStatus({ state: 'invalid', message: 'Use 3–20 of letters, numbers, _ . - and spaces.' });
        return;
      }

      clearTimeout(this._cu_debounceTimer);
      this._updateCUStatus({ state: 'checking', message: 'Checking…' });
      this._cu_debounceTimer = setTimeout(async () => {
        try {
          const result = await this.checkUsernameAvailability(proposedVisible);
          const liveKey = this.toKeyUsername((document.getElementById('cu-input')?.value || '').trim());
          if (liveKey === this._cu_originalKey) {
            this._updateCUStatus({ state: 'same', message: 'That’s already your username.' });
            return;
          }
          this._updateCUStatus(result);
        } catch {
          this._updateCUStatus({ state: 'taken', message: 'Could not verify availability.' });
        }
      }, 300);
    };

    input.addEventListener('input', this._cu_onInput);
  }

  setupAuthListener() {
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.handleUserLogin(user);
      } else {
        this.handleUserLogout();
      }
    });

    this.auth.getRedirectResult()
      .then(async (res) => {
        if (res && res.user) {
          await this.ensureProfileAndUsername(res.user);
        }
      })
      .catch((e) => {
        if (e && e.code && e.code !== 'auth/no-auth-event') {
          console.warn('getRedirectResult error:', e);
        }
      });
  }

  async loginWithGoogle() {
    this.clearAuthErrors();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');

    try {
      const cred = await this.auth.signInWithPopup(provider);
      await this.ensureProfileAndUsername(cred.user);
    } catch (error) {
      console.warn('Popup sign-in failed; attempting redirect…', error);

      if (
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/popup-closed-by-user' ||
        /Cross-Origin-Opener-Policy|blocked/i.test(String(error?.message || ''))
      ) {
        try {
          await this.auth.signInWithRedirect(provider);
          return;
        } catch (e2) {
          console.error('Redirect sign-in also failed:', e2);
          this.handleAuthError(e2);
        }
        return;
      }

      if (error.code === 'auth/account-exists-with-different-credential' && error.email) {
        const methods = await this.auth.fetchSignInMethodsForEmail(error.email);
        if (methods && methods.includes('password')) {
          this.game.showToast('That email already has a password account. Sign in with email & password, then link Google.', 'warning');
        } else {
          this.game.showToast('Account exists with a different provider for this email.', 'error');
        }
      } else {
        this.handleAuthError(error);
      }
    }
  }

  async ensureProfileAndUsername(user) {
    const uid = user.uid;
    const email = user.email || null;
    const userRef = this.db.ref('users/' + uid);
    const snap = await userRef.once('value');

    if (!snap.exists()) {
      const base =
        (user.displayName && user.displayName.trim()) ||
        (email ? email.split('@')[0] : 'Player');

      const suggested = await this.pickAvailableUsername(base);

      await this.createUserProfile(uid, {
        username: suggested,
        email: email
      });

      const unameKey = this.toKeyUsername(suggested);
      await this.db.ref('usernames/' + unameKey).set({ uid: uid, email: email || '' });
    } else {
      await userRef.update({ lastLogin: Date.now() });
    }

    const latest = (await userRef.once('value')).val() || {};
    this.game.usernameGlobal = latest.username || (email ? email.split('@')[0] : 'Player');
    const cu = document.getElementById('currentUser');
    if (cu) cu.textContent = this.game.usernameGlobal;

    document.getElementById('userInfo').classList.remove('hidden');
    this.game.resetSessionStats();
    this.game.showSection('menuSection');
    this.game.showToast('Signed in with Google', 'success');
  }

  async pickAvailableUsername(base) {
    const cleanVisible = base.replace(/[^a-zA-Z0-9_.\- ]/g, '').trim();
    const visible = cleanVisible.length >= 3 ? cleanVisible : `Player${Math.floor(Math.random() * 1000)}`;

    let keyBase = this.toKeyUsername(visible);
    if (!keyBase) keyBase = 'player';

    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? keyBase : `${keyBase}${i}`;
      const exists = (await this.db.ref('usernames/' + candidate).once('value')).exists();
      if (!exists) {
        return i === 0 ? visible : `${visible}${i}`;
      }
    }
    return `${visible}${Date.now() % 1000}`;
  }

  startChangeUsername() {
    const user = this.auth.currentUser;
    if (!user) {
      this.game.showToast('Please log in first', 'error');
      this.game.showSection('authSection');
      return;
    }

    const current = this.game.usernameGlobal || '';
    const input = prompt('Enter new username (3–20 chars: letters, numbers, _ . - and spaces):', current);
    if (input == null) return;

    const proposed = input.trim();
    if (!/^[a-zA-Z0-9_.\- ]{3,20}$/.test(proposed)) {
      this.game.showToast('Invalid username format', 'error');
      return;
    }

    this.changeUsername(proposed).catch(err => {
      console.error('Change username error:', err);
      this.game.showToast('Failed to change username', 'error');
    });
  }

  async changeUsername(newVisibleUsername) {
    const user = this.auth.currentUser;
    if (!user) {
      this.game.showToast('Please log in first', 'error');
      this.game.showSection('authSection');
      return;
    }

    const newKey = this.toKeyUsername(newVisibleUsername);

    if (!newKey) {
      this.game.showToast('Invalid username', 'error');
      return;
    }

    const userRef = this.db.ref('users/' + user.uid);
    const profileSnap = await userRef.once('value');
    const profile = profileSnap.val() || {};
    const oldVisible = profile.username || '';
    const oldKey = this.toKeyUsername(oldVisible);
    const email = profile.email || user.email || '';

    if (oldKey === newKey) {
      this.game.showToast('That is already your username', 'info');
      return;
    }

    const newMapRef = this.db.ref('usernames/' + newKey);
    const newMapSnap = await newMapRef.once('value');
    if (newMapSnap.exists()) {
      this.game.showToast('Username is already taken', 'error');
      return;
    }

    if (oldKey) {
      const oldMapRef = this.db.ref('usernames/' + oldKey);
      const oldMapSnap = await oldMapRef.once('value');
      if (oldMapSnap.exists() && oldMapSnap.val().uid !== user.uid) {
        this.game.showToast('Ownership mismatch on old username mapping', 'error');
        return;
      }
    }

    const updates = {};
    updates['usernames/' + newKey] = { uid: user.uid, email: email };
    if (oldKey) updates['usernames/' + oldKey] = null;
    updates['users/' + user.uid + '/username'] = newVisibleUsername;

    await this.db.ref().update(updates);

    this.game.usernameGlobal = newVisibleUsername;
    const cu = document.getElementById('currentUser');
    if (cu) cu.textContent = newVisibleUsername;

    this.game.showToast('Username updated', 'success');

    const lb = document.getElementById('leaderboardSection');
    if (lb && !lb.classList.contains('hidden') && this.game.leaderboardManager) {
      try { await this.game.leaderboardManager.loadLeaderboard(); } catch { }
    }

    const daily = document.getElementById('dailySection');
    if (daily && !daily.classList.contains('hidden')) {
      try { await this.game.leaderboardManager.loadDailyLeaderboard(); } catch { }
    }

    try { await this.game.loadProfile(); } catch { }
  }

  async checkUsernameAvailability(visibleName) {
    const user = this.auth.currentUser;
    if (!user) return { state: 'invalid', message: 'Not signed in.' };

    if (!this._isValidVisibleUsername(visibleName)) {
      return { state: 'invalid', message: 'Use 3–20 of letters, numbers, _ . - and spaces.' };
    }

    const newKey = this.toKeyUsername(visibleName);
    if (!newKey) return { state: 'invalid', message: 'Invalid username.' };

    const userRef = this.db.ref('users/' + user.uid);
    const snap = await userRef.once('value');
    const profile = snap.val() || {};
    const oldVisible = profile.username || '';
    const oldKey = this.toKeyUsername(oldVisible);

    if (oldKey === newKey) {
      return { state: 'same', message: 'That’s already your username.' };
    }

    const mapRef = this.db.ref('usernames/' + newKey);
    const mapSnap = await mapRef.once('value');
    if (!mapSnap.exists()) {
      return { state: 'available', message: 'Available ✓' };
    }

    const ownerUid = (mapSnap.val() || {}).uid;
    if (ownerUid === user.uid) {
      return { state: 'same', message: 'That’s already your username.' };
    }

    return { state: 'taken', message: 'This username is already taken.' };
  }

  async openChangeUsernameModal() {
    const user = this.auth.currentUser;
    if (!user) {
      this.game.showToast('Please log in first', 'error');
      this.game.showSection('authSection');
      return;
    }

    const overlay = document.getElementById('changeUsernameOverlay');
    const input = document.getElementById('cu-input');
    const err = document.getElementById('cu-error');
    const saveBtn = document.getElementById('cu-save');
    const status = document.getElementById('cu-status');

    if (!overlay || !input || !err || !saveBtn || !status) {
      console.warn('Change Username modal elements not found.');
      this.game.showToast('UI not updated: add the Change Username modal to index.html', 'error');
      return;
    }

    try {
      const snap = await this.db.ref('users/' + user.uid).once('value');
      const profile = snap.val() || {};
      const current = profile.username ||
        this.game.usernameGlobal ||
        (user.displayName && user.displayName.trim()) ||
        (user.email ? user.email.split('@')[0] : '');
      input.value = current;

      this._cu_originalVisible = current || '';
      this._cu_originalKey = this.toKeyUsername(this._cu_originalVisible);
    } catch {
      input.value = this.game.usernameGlobal || '';
      this._cu_originalVisible = input.value || '';
      this._cu_originalKey = this.toKeyUsername(this._cu_originalVisible);
    }

    err.textContent = '';
    err.classList.add('hidden');
    status.textContent = '';
    status.classList.add('hidden');
    saveBtn.disabled = true;

    overlay.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);

    this._cu_keyHandler = (e) => {
      if (e.key === 'Enter') {
        if (!saveBtn.disabled) this.submitChangeUsernameModal();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.closeChangeUsernameModal();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', this._cu_keyHandler, true);

    this._bindCUInputHandler();
  }

  closeChangeUsernameModal() {
    const overlay = document.getElementById('changeUsernameOverlay');
    const input = document.getElementById('cu-input');
    if (overlay) overlay.classList.add('hidden');

    if (this._cu_keyHandler) {
      document.removeEventListener('keydown', this._cu_keyHandler, true);
      this._cu_keyHandler = null;
    }
    if (input && this._cu_onInput) {
      input.removeEventListener('input', this._cu_onInput);
    }
    clearTimeout(this._cu_debounceTimer);
    this._cu_onInput = null;
    this._cu_debounceTimer = null;
  }

  async submitChangeUsernameModal() {
    const input = document.getElementById('cu-input');
    const err = document.getElementById('cu-error');
    const saveBtn = document.getElementById('cu-save');
    if (!input || !err || !saveBtn) return;

    const proposed = (input.value || '').trim();
    const proposedKey = this.toKeyUsername(proposed);

    if (!this._isValidVisibleUsername(proposed)) {
      err.textContent = 'Invalid format. Use 3–20 of letters, numbers, _ . - and spaces.';
      err.classList.remove('hidden');
      return;
    }

    if (proposedKey === this._cu_originalKey) {
      err.textContent = 'Please enter a different username.';
      err.classList.remove('hidden');
      return;
    }

    const avail = await this.checkUsernameAvailability(proposed);
    if (avail.state !== 'available') {
      err.textContent = (avail.message || 'Not available.');
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');

    this.game.setButtonBusy(saveBtn, true);
    try {
      await this.changeUsername(proposed);
      this.closeChangeUsernameModal();
    } catch (e) {
      console.error('submitChangeUsernameModal error:', e);
      err.textContent = 'Failed to change username. Please try again.';
      err.classList.remove('hidden');
    } finally {
      this.game.setButtonBusy(saveBtn, false);
    }
  }

  async handleUserLogin(user) {
    const userRef = this.db.ref('users/' + user.uid);
    let snap = await userRef.once('value');

    if (!snap.exists()) {
      const fallbackName =
        (user.displayName && user.displayName.trim()) ||
        (user.email ? user.email.split('@')[0] : 'Player');

      await this.createUserProfile(user.uid, {
        username: fallbackName,
        email: user.email || null
      });

      snap = await userRef.once('value');
    } else {
      await userRef.update({ lastLogin: firebase.database.ServerValue.TIMESTAMP });
    }

    const data = snap.val() || {};

    this.game.usernameGlobal =
      data.username ||
      (user.displayName && user.displayName.trim()) ||
      (user.email ? user.email.split('@')[0] : 'Player');

    const cu = document.getElementById('currentUser');
    if (cu) cu.textContent = this.game.usernameGlobal;

    document.getElementById('userInfo').classList.remove('hidden');
    this.game.resetSessionStats();
    this.game.showSection('menuSection');
    this.game.showToast('Welcome back!', 'success');
  }


  handleUserLogout() {
    this.game.usernameGlobal = null;
    document.getElementById('userInfo').classList.add('hidden');
    this.game.multiplayerManager.leaveRoom();
    this.game.showSection('authSection');
    this.game.showToast('Logged out successfully');
  }

  async createUserProfile(uid, usernameOrObj) {
    const base = typeof usernameOrObj === 'string'
      ? { username: usernameOrObj, email: usernameOrObj.includes('@') ? usernameOrObj : null }
      : usernameOrObj;

    const userData = {
      ...base,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastLogin: firebase.database.ServerValue.TIMESTAMP,
      totalScore: 0,
      bestStreak: 0,
      fastestSolve: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      multiplayerGames: 0,
      multiplayerWins: 0
    };

    await this.db.ref('users/' + uid).set(userData);
  }

  showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authTitle').textContent = 'Welcome Back!';
    this.clearAuthErrors();

    const usernameField = document.getElementById('loginUsername');
    if (usernameField) usernameField.focus();
  }

  showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('authTitle').textContent = 'Create Account';
    this.clearAuthErrors();

    const usernameField = document.getElementById('regUsername');
    if (usernameField) usernameField.focus();
  }

  clearAuthErrors() {
    ['loginUsername', 'loginPassword', 'regUsername', 'regPassword'].forEach(id => {
      this.clearFieldError(id);
    });
  }

  setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);

    if (field && errorElement) {
      field.classList.add('border-red-500');
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    }
  }

  clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);

    if (field && errorElement) {
      field.classList.remove('border-red-500');
      errorElement.classList.add('hidden');
    }
  }

  async login() {
    this.clearAuthErrors();

    const userOrEmail = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    let isValid = true;

    if (!userOrEmail) {
      this.setFieldError('loginUsername', 'Username or Email is required');
      isValid = false;
    }
    if (!password) {
      this.setFieldError('loginPassword', 'Password is required');
      isValid = false;
    }
    if (!isValid) {
      this.game.showToast('Please fix the errors above', 'error');
      return;
    }

    const loginButton = document.querySelector('#loginForm button');
    this.game.setButtonBusy(loginButton, true);

    try {
      let emailToUse = userOrEmail;

      if (!/@/.test(userOrEmail)) {
        const unameKey = this.toKeyUsername(userOrEmail);
        const mapSnap = await this.db.ref('usernames/' + unameKey).once('value');
        if (!mapSnap.exists()) {
          this.setFieldError('loginUsername', 'No account with that username');
          this.game.showToast('Invalid credentials', 'error');
          return;
        }
        emailToUse = mapSnap.val().email;
      }

      await this.auth.signInWithEmailAndPassword(emailToUse, password);
    } catch (error) {
      console.error('Login error:', error);
      this.handleAuthError(error);
    } finally {
      this.game.setButtonBusy(loginButton, false);
    }
  }


  async register() {
    this.clearAuthErrors();

    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value.trim();

    let isValid = true;

    if (!username) {
      this.setFieldError('regUsername', 'Username is required');
      isValid = false;
    } else if (!/^[a-zA-Z0-9_\. -]{3,20}$/.test(username)) {
      this.setFieldError('regUsername', '3–20 chars (letters, numbers, _ . - and spaces)');
      isValid = false;
    }

    if (!email) {
      this.setFieldError('regEmail', 'Email is required');
      isValid = false;
    } else if (!this.isValidEmail(email)) {
      this.setFieldError('regEmail', 'Please enter a valid email');
      isValid = false;
    }

    if (!password) {
      this.setFieldError('regPassword', 'Password is required');
      isValid = false;
    } else if (password.length < 6) {
      this.setFieldError('regPassword', 'Password must be at least 6 characters');
      isValid = false;
    }

    if (!isValid) {
      this.game.showToast('Please fix the errors above', 'error');
      return;
    }

    const registerButton = document.querySelector('#registerForm button');
    this.game.setButtonBusy(registerButton, true);

    let cred;
    try {
      cred = await this.auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('User creation error:', error);
      this.handleAuthError(error);
      return;
    }

    const unameKey = this.toKeyUsername(username);

    try {
      const unameRef = this.db.ref('usernames/' + unameKey);
      const claim = await unameRef.transaction(curr => {
        if (curr === null) return { uid: cred.user.uid, email };
        return;
      });

      if (!claim.committed) {
        try { await cred.user.delete(); } catch { }
        this.setFieldError('regUsername', 'That username was just taken. Pick another.');
        this.game.showToast('Username already claimed', 'error');
        return;
      }

      await this.createUserProfile(cred.user.uid, {
        username,
        email
      });


    } catch (error) {
      console.error('Registration error:', error);
      if (error.code === 'PERMISSION_DENIED') {
        this.setFieldError('regUsername', 'Username was just taken. Pick another.');
        this.game.showToast('Username already claimed', 'error');
      } else {
        this.handleAuthError(error);
      }
    } finally {
      this.game.setButtonBusy(registerButton, false);
    }
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  handleAuthError(error) {
    let message = 'Authentication failed';

    switch (error.code) {
      case 'auth/email-already-in-use':
        message = 'Email is already registered';
        this.setFieldError('regEmail', message);
        break;
      case 'auth/invalid-email':
        message = 'Invalid email address';
        this.setFieldError('loginUsername', message);
        break;
      case 'auth/user-not-found':
        message = 'No account found with this email';
        this.setFieldError('loginUsername', message);
        break;
      case 'auth/wrong-password':
        message = 'Incorrect password';
        this.setFieldError('loginPassword', message);
        break;
      case 'auth/weak-password':
        message = 'Password is too weak';
        this.setFieldError('regPassword', message);
        break;
      default:
        message = error.message;
    }

    this.game.showToast(message, 'error');
  }

  async logout() {
    try {
      await this.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
      this.game.showToast('Logout failed', 'error');
    }
  }
}