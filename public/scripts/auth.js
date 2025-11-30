class AuthManager {
  verifySessionAndShowUI(onDone) {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; onDone(); } };
    const unsub = this.auth.onAuthStateChanged((user) => {
      unsub();
      finish();
    });
    setTimeout(finish, 2500);
  }
  constructor(game) {
    this.game = game;
    this.auth = game.auth;
    this.db = game.db;
    this._suppressNextLogoutToast = false;
    this._blockAutoLogin = false;
    this._deletingAuthUser = false;
    this._wasLoggedIn = false;
    this._preserveRegisterFields = null;
    this._preserveLoginFields = null;
    this._guestAuthPromise = null;
    this._guestAuthUnavailable = false;
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
      if (user && !user.isAnonymous) {
        if (this._blockAutoLogin || this._deletingAuthUser) return;
        this.handleUserLogin(user);
      } else {
        this.handleUserLogout();
        this.ensureGuestAuth();
      }
    });

    this.auth.getRedirectResult()
      .then(async (res) => {
        const intent = sessionStorage.getItem('googleIntent');
        if (intent) sessionStorage.removeItem('googleIntent');
        if (res && res.user) {
          try {
            const snap = await this.db.ref('users/' + res.user.uid).once('value');
            const exists = snap.exists();

            if (intent === 'register' && exists) {
              this._suppressNextLogoutToast = true;
              const emailToPreserve = res.user.email || '';
              this._preserveLoginFields = { username: emailToPreserve };
              try { await this.auth.signOut(); } catch { }
              this.showLogin();
              setTimeout(() => {
                const loginField = document.getElementById('loginUsername');
                if (loginField && (!loginField.value || loginField.value !== emailToPreserve)) {
                  loginField.value = emailToPreserve;
                }
              }, 100);
              this.game.showToast('Google account already registered. Please sign in.', 'info');
              return;
            }

            if ((intent === 'login' || !intent) && !exists) {
              this._suppressNextLogoutToast = true;
              const emailToPreserve = res.user.email || '';
              const usernameToPreserve = res.user.displayName || '';
              this._preserveRegisterFields = {
                email: emailToPreserve,
                username: usernameToPreserve,
                password: ''
              };
              this._deletingAuthUser = true;
              try { await res.user.delete(); } catch { }
              try { await this.auth.signOut(); } catch { }
              this._deletingAuthUser = false;
              this.showRegister();
              setTimeout(() => {
                const regEmailField = document.getElementById('regEmail');
                if (regEmailField && (!regEmailField.value || regEmailField.value !== emailToPreserve)) {
                  regEmailField.value = emailToPreserve;
                }
                const regUsernameField = document.getElementById('regUsername');
                if (regUsernameField && usernameToPreserve && (!regUsernameField.value || regUsernameField.value !== usernameToPreserve)) {
                  regUsernameField.value = usernameToPreserve;
                }
              }, 100);
              this.game.showToast('Google account not registered. Please register first.', 'warning');
              return;
            }
          } catch { }

          await this.ensureProfileAndUsername(res.user);
        }
      })
      .catch((e) => {
        if (e && e.code && e.code !== 'auth/no-auth-event') {
          console.warn('getRedirectResult error:', e);
        }
      });
  }

  async loginWithGoogle(mode) {
    this.clearAuthErrors();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');

    const isRegistrationAttempt = mode === 'register' || !document.getElementById('registerForm')?.classList.contains('hidden');

    try {
      this._blockAutoLogin = true;

      const cred = await this.auth.signInWithPopup(provider);
      const user = cred?.user;
      if (!user) throw new Error('Google sign-in returned no user');

      const snap = await this.db.ref('users/' + user.uid).once('value');
      const exists = snap.exists();

      if (isRegistrationAttempt && exists) {
        this._suppressNextLogoutToast = true;
        const emailToPreserve = user.email || '';
        this._preserveLoginFields = { username: emailToPreserve };
        try { await this.auth.signOut(); } catch { }
        this.showLogin();
        setTimeout(() => {
          const loginField = document.getElementById('loginUsername');
          if (loginField && (!loginField.value || loginField.value !== emailToPreserve)) {
            loginField.value = emailToPreserve;
          }
        }, 100);
        this.game.showToast('Google account already registered. Please sign in.', 'info');
        return;
      } else if (!isRegistrationAttempt && !exists) {
        this._suppressNextLogoutToast = true;
        const emailToPreserve = user.email || '';
        const usernameToPreserve = user.displayName || '';
        this._preserveRegisterFields = {
          email: emailToPreserve,
          username: usernameToPreserve,
          password: ''
        };
        this._deletingAuthUser = true;
        try { await user.delete(); } catch { }
        try { await this.auth.signOut(); } catch { }
        this._deletingAuthUser = false;
        this.showRegister();
        setTimeout(() => {
          const regEmailField = document.getElementById('regEmail');
          if (regEmailField && (!regEmailField.value || regEmailField.value !== emailToPreserve)) {
            regEmailField.value = emailToPreserve;
          }
          const regUsernameField = document.getElementById('regUsername');
          if (regUsernameField && usernameToPreserve && (!regUsernameField.value || regUsernameField.value !== usernameToPreserve)) {
            regUsernameField.value = usernameToPreserve;
          }
        }, 100);
        this.game.showToast('Google account not registered. Please register first.', 'warning');
        return;
      }

      this._blockAutoLogin = false;
      await this.ensureProfileAndUsername(user);
    } catch (error) {
      console.warn('Popup sign-in failed; attempting redirect…', error);

      if (
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/popup-closed-by-user' ||
        /Cross-Origin-Opener-Policy|blocked/i.test(String(error?.message || ''))
      ) {
        try {
          if (mode) sessionStorage.setItem('googleIntent', mode);
          await this.auth.signInWithRedirect(provider);
          return;
        } catch (e2) {
          console.warn('Redirect sign-in also failed:', e2);
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
    } finally {
      this._blockAutoLogin = false;
    }
  }

  async linkGoogleAccount() {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      this.game.showToast('Please sign in first to link Google.', 'error');
      this.showLogin();
      return;
    }

    const hasGoogleProvider = !!(currentUser.providerData && currentUser.providerData.some(p => p.providerId === 'google.com'));
    if (hasGoogleProvider) {
      this.game.showToast('Google is already linked to this account.', 'info');
      const linkBtn = document.getElementById('linkGoogleBtn');
      if (linkBtn) linkBtn.classList.add('hidden');
      return;
    }

    let accountEmail = currentUser.email || '';
    if (!accountEmail) {
      try {
        const snap = await this.db.ref('users/' + currentUser.uid).once('value');
        const profile = snap.val() || {};
        if (profile.email) accountEmail = profile.email;
      } catch (e) {
      }
    }

    accountEmail = (accountEmail || '').trim();
    if (!accountEmail) {
      this.game.showToast('Cannot determine your account email. Please contact support.', 'error');
      return;
    }

    const linkButton = document.getElementById('linkGoogleBtn');
    if (linkButton) this.game.setButtonBusy(linkButton, true);

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');

    try {
      const result = await currentUser.linkWithPopup(provider);

      const googleProfile = result?.user?.providerData?.find((p) => p.providerId === 'google.com');
      const googleEmail =
        (googleProfile?.email ||
          result?.additionalUserInfo?.profile?.email ||
          '').trim();

      if (!googleEmail) {
        try { await currentUser.unlink('google.com'); } catch (e) { }
        this.game.showToast('Could not read Google account email. Please try again.', 'error');
        return;
      }

      if (googleEmail.toLowerCase() !== accountEmail.toLowerCase()) {
        try { await currentUser.unlink('google.com'); } catch (e) { }
        this.game.showToast(`Google email must match your account email (${accountEmail}).`, 'error');
        return;
      }

      this.game.showToast('Google account linked. You can now sign in with Google or password.', 'success');
      if (linkButton) linkButton.classList.add('hidden');
    } catch (error) {
      console.warn('Link Google failed:', error);
      switch (error.code) {
        case 'auth/credential-already-in-use':
          this.game.showToast('That Google account is already linked to another profile.', 'error');
          break;
        case 'auth/popup-blocked':
        case 'auth/popup-closed-by-user':
          this.game.showToast('Popup blocked. Please allow popups and try again.', 'warning');
          break;
        case 'auth/requires-recent-login':
          this.game.showToast('Please sign in again, then link Google.', 'warning');
          await this.auth.signOut();
          this.showLogin();
          break;
        default:
          this.handleAuthError(error);
      }
    } finally {
      if (linkButton) this.game.setButtonBusy(linkButton, false);
    }
  }

  openAccountRecovery() {
    const modal = document.getElementById('accountRecoveryModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  closeAccountRecovery() {
    const modal = document.getElementById('accountRecoveryModal');
    if (!modal) return;
    modal.classList.add('hidden');
    this._resetAccountRecoveryModal();
  }

  _resetAccountRecoveryModal() {
    ['recoverUsernameEmailInput', 'recoverEmailUsernameInput', 'passwordResetEmailInput'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

    ['recoverUsernameStatus', 'recoverEmailStatus', 'passwordResetStatus'].forEach((id) => {
      this._setRecoveryStatus(id, null, '');
    });

    ['recoverUsernameBtn', 'recoverEmailBtn', 'passwordResetBtn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) this.game.setButtonBusy(btn, false);
    });
  }

  _setRecoveryStatus(target, tone, message) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;

    el.classList.remove('hidden', 'text-red-600', 'text-green-600', 'text-yellow-600', 'dark:text-red-400', 'dark:text-green-400', 'dark:text-yellow-400');

    if (!message) {
      el.textContent = '';
      el.classList.add('hidden');
      return;
    }

    el.textContent = message;
    switch (tone) {
      case 'success':
        el.classList.add('text-green-600', 'dark:text-green-400');
        break;
      case 'error':
        el.classList.add('text-red-600', 'dark:text-red-400');
        break;
      default:
        el.classList.add('text-yellow-600', 'dark:text-yellow-400');
    }
  }

  async recoverUsernameFromEmail() {
    const input = document.getElementById('recoverUsernameEmailInput');
    const status = document.getElementById('recoverUsernameStatus');
    const button = document.getElementById('recoverUsernameBtn');
    if (!input || !status || !button) return;

    const emailRaw = (input.value || '').trim();
    if (!emailRaw) {
      this._setRecoveryStatus(status, 'error', 'Please enter the email you used to register.');
      input.focus();
      return;
    }

    const email = emailRaw;
    this._setRecoveryStatus(status, 'info', 'Looking up that email…');
    this.game.setButtonBusy(button, true);

    try {
      const authed = await this.ensureGuestAuth();
      if (!authed) {
        this._setRecoveryStatus(status, 'error', 'Account recovery is temporarily unavailable. Please contact support.');
        return;
      }

      const snap = await this.db.ref('users').orderByChild('email').equalTo(email).once('value');
      if (!snap.exists()) {
        this._setRecoveryStatus(status, 'error', 'No account was found with that email.');
        return;
      }

      const profiles = snap.val() || {};
      const usernames = Object.values(profiles)
        .map((profile) => profile && profile.username ? profile.username : null)
        .filter(Boolean);

      if (!usernames.length) {
        this._setRecoveryStatus(status, 'error', 'That account does not have a username stored yet.');
        return;
      }

      const uniqueUsernames = [...new Set(usernames)];
      const list = uniqueUsernames.join(', ');
      this._setRecoveryStatus(
        status,
        'success',
        uniqueUsernames.length === 1
          ? `Great news! Your username is "${uniqueUsernames[0]}".`
          : `We found multiple usernames for that email: ${list}`
      );
    } catch (error) {
      this._setRecoveryStatus(status, 'error', 'Unable to look up that email right now. Please try again.');
    } finally {
      this.game.setButtonBusy(button, false);
    }
  }

  async recoverEmailFromUsername() {
    const input = document.getElementById('recoverEmailUsernameInput');
    const status = document.getElementById('recoverEmailStatus');
    const button = document.getElementById('recoverEmailBtn');
    if (!input || !status || !button) return;

    const username = (input.value || '').trim();
    if (!username) {
      this._setRecoveryStatus(status, 'error', 'Please enter your username.');
      input.focus();
      return;
    }

    const usernameKey = this.toKeyUsername(username);
    if (!usernameKey) {
      this._setRecoveryStatus(status, 'error', 'Usernames must be 3–20 characters.');
      return;
    }

    this._setRecoveryStatus(status, 'info', 'Looking up that username…');
    this.game.setButtonBusy(button, true);

    try {
      const authed = await this.ensureGuestAuth();
      if (!authed) {
        this._setRecoveryStatus(status, 'error', 'Account recovery is temporarily unavailable. Please contact support.');
        return;
      }

      const snap = await this.db.ref('usernames/' + usernameKey).once('value');
      if (!snap.exists()) {
        this._setRecoveryStatus(status, 'error', 'We could not find an email for that username.');
        return;
      }

      const record = snap.val() || {};
      if (!record.email) {
        this._setRecoveryStatus(status, 'error', 'No email is linked to that username.');
        return;
      }

      this._setRecoveryStatus(status, 'success', `Email on file: ${this.maskEmail(record.email)}`);
    } catch (error) {
      this._setRecoveryStatus(status, 'error', 'Unable to look up that username right now. Please try again.');
    } finally {
      this.game.setButtonBusy(button, false);
    }
  }

  async sendRecoveryPasswordEmail() {
    const input = document.getElementById('passwordResetEmailInput');
    const status = document.getElementById('passwordResetStatus');
    const button = document.getElementById('passwordResetBtn');
    if (!input || !status || !button) return;

    const emailRaw = (input.value || '').trim();
    if (!emailRaw) {
      this._setRecoveryStatus(status, 'error', 'Please enter the email you used for your account.');
      input.focus();
      return;
    }

    const email = emailRaw;
    this._setRecoveryStatus(status, 'info', 'Sending reset email…');
    this.game.setButtonBusy(button, true);

    try {
      await this.auth.sendPasswordResetEmail(email);
      this._setRecoveryStatus(status, 'success', 'Password reset email sent if account exist in our system! Check your inbox (and spam folder).');
    } catch (error) {
      let message = 'Unable to send a reset email right now.';
      switch (error.code) {
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/user-not-found':
          message = 'No account exists with that email.';
          break;
        default:
          message = error.message || message;
      }
      this._setRecoveryStatus(status, 'error', message);
    } finally {
      this.game.setButtonBusy(button, false);
    }
  }

  maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) {
      return email.replace(/.(?=.)/g, '*');
    }

    const safeLocal =
      local.length <= 2
        ? (local[0] || '') + '*'.repeat(Math.max(local.length - 1, 1))
        : local.slice(0, 2) + '*'.repeat(Math.min(3, local.length - 2));

    const domainParts = domain.split('.');
    if (domainParts.length < 2) {
      return `${safeLocal}@${domain}`;
    }

    const primaryDomain = domainParts[0];
    const maskedDomain =
      primaryDomain.length <= 2
        ? (primaryDomain[0] || '') + '*'
        : primaryDomain[0] + '*'.repeat(Math.min(3, primaryDomain.length - 2)) + primaryDomain.slice(-1);

    return `${safeLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
  }

  async ensureGuestAuth() {
    const current = this.auth.currentUser;
    if (current && !current.isAnonymous) return true;
    if (current && current.isAnonymous) return true;
    if (this._guestAuthUnavailable) return false;
    if (this._guestAuthPromise) {
      try {
        await this._guestAuthPromise;
        return true;
      } catch {
        return false;
      }
    }

    this._guestAuthPromise = this.auth.signInAnonymously()
      .catch((error) => {
        console.warn('Guest auth failed:', error);
        if (error?.code === 'auth/operation-not-allowed') {
          this._guestAuthUnavailable = true;
          this.game.showToast('Enable anonymous auth in Firebase to allow account recovery.', 'error');
        }
        throw error;
      })
      .finally(() => {
        this._guestAuthPromise = null;
      });

    try {
      await this._guestAuthPromise;
      return true;
    } catch {
      return false;
    }
  }

  async ensureProfileAndUsername(user) {
    if (this._deletingAuthUser) return;

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
    this.openChangeUsernameModal();
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
      err.textContent = 'Failed to change username. Please try again.';
      err.classList.remove('hidden');
    } finally {
      this.game.setButtonBusy(saveBtn, false);
    }
  }

  openChangePasswordModal() {
    const user = this.auth.currentUser;
    if (!user) {
      this.game.showToast('Please log in first', 'error');
      this.game.showSection('authSection');
      return;
    }

    const overlay = document.getElementById('changePasswordOverlay');
    const cur = document.getElementById('cp-current');
    const nw = document.getElementById('cp-new');
    const conf = document.getElementById('cp-confirm');
    const err = document.getElementById('cp-error');
    const saveBtn = document.getElementById('cp-save');

    if (!overlay || !cur || !nw || !conf || !err || !saveBtn) {
      console.warn('Change Password modal elements not found.');
      this.game.showToast('UI not updated: add the Change Password modal to index.html', 'error');
      return;
    }

    cur.value = '';
    nw.value = '';
    conf.value = '';
    err.textContent = '';
    err.classList.add('hidden');

    overlay.classList.remove('hidden');
    setTimeout(() => cur.focus(), 0);

    try { saveBtn.disabled = true; } catch (e) { }

    const matchEl = document.getElementById('cp-match');

    this._cp_onInput = () => {
      const newVal = (nw.value || '').trim();
      const confVal = (conf.value || '').trim();

      if (err) {
        err.textContent = '';
        err.classList.add('hidden');
      }

      if (!newVal && !confVal) {
        if (matchEl) { matchEl.textContent = ''; matchEl.classList.add('hidden'); }
        try { saveBtn.disabled = true; } catch (e) { }
        return;
      }

      if (newVal && newVal.length < 6) {
        if (matchEl) {
          matchEl.textContent = 'New password is too short (min 6 chars)';
          matchEl.classList.remove('hidden');
          matchEl.classList.remove('text-green-600', 'dark:text-green-400');
          matchEl.classList.add('text-red-500');
        }
        try { saveBtn.disabled = true; } catch (e) { }
        return;
      }

      if (confVal === '') {
        if (matchEl) { matchEl.textContent = ''; matchEl.classList.add('hidden'); }
        try { saveBtn.disabled = true; } catch (e) { }
        return;
      }

      if (newVal === confVal) {
        if (matchEl) {
          matchEl.textContent = 'Passwords match';
          matchEl.classList.remove('hidden');
          matchEl.classList.remove('text-red-500');
          matchEl.classList.add('text-green-600', 'dark:text-green-400');
        }
        try { saveBtn.disabled = false; } catch (e) { }
      } else {
        if (matchEl) {
          matchEl.textContent = 'Passwords do not match';
          matchEl.classList.remove('hidden');
          matchEl.classList.remove('text-green-600', 'dark:text-green-400');
          matchEl.classList.add('text-red-500');
        }
        try { saveBtn.disabled = true; } catch (e) { }
      }
    };

    nw.addEventListener('input', this._cp_onInput);
    conf.addEventListener('input', this._cp_onInput);

    this._cp_keyHandler = (e) => {
      if (e.key === 'Enter') {
        if (!saveBtn.disabled) this.submitChangePasswordModal();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.closeChangePasswordModal();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', this._cp_keyHandler, true);
  }

  closeChangePasswordModal() {
    const overlay = document.getElementById('changePasswordOverlay');
    if (overlay) overlay.classList.add('hidden');

    if (this._cp_keyHandler) {
      document.removeEventListener('keydown', this._cp_keyHandler, true);
      this._cp_keyHandler = null;
    }
    try {
      const nw = document.getElementById('cp-new');
      const conf = document.getElementById('cp-confirm');
      if (this._cp_onInput) {
        if (nw) nw.removeEventListener('input', this._cp_onInput);
        if (conf) conf.removeEventListener('input', this._cp_onInput);
      }
      this._cp_onInput = null;
      const matchEl = document.getElementById('cp-match');
      if (matchEl) { matchEl.textContent = ''; matchEl.classList.add('hidden'); }
    } catch (e) { }
  }

  async submitChangePasswordModal() {
    const cur = document.getElementById('cp-current');
    const nw = document.getElementById('cp-new');
    const conf = document.getElementById('cp-confirm');
    const err = document.getElementById('cp-error');
    const saveBtn = document.getElementById('cp-save');

    if (!cur || !nw || !conf || !err || !saveBtn) return;

    const currentPwd = (cur.value || '').trim();
    const newPwd = (nw.value || '').trim();
    const confirm = (conf.value || '').trim();

    if (!currentPwd) {
      err.textContent = 'Enter your current password';
      err.classList.remove('hidden');
      return;
    }
    if (!newPwd || newPwd.length < 6) {
      err.textContent = 'New password must be at least 6 characters';
      err.classList.remove('hidden');
      return;
    }
    if (newPwd !== confirm) {
      err.textContent = 'New passwords do not match';
      err.classList.remove('hidden');
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      this.game.showToast('Please log in first', 'error');
      this.closeChangePasswordModal();
      return;
    }

    let email = user.email || null;
    try {
      const snap = await this.db.ref('users/' + user.uid).once('value');
      const profile = snap.val() || {};
      if (!email && profile.email) email = profile.email;
    } catch { }

    if (!email) {
      err.textContent = 'Cannot determine account email for reauthentication';
      err.classList.remove('hidden');
      return;
    }

    this.game.setButtonBusy(saveBtn, true);
    err.textContent = '';
    err.classList.add('hidden');

    try {
      const credential = firebase.auth.EmailAuthProvider.credential(email, currentPwd);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPwd);
      this.game.showToast('Password updated', 'success');
      this.closeChangePasswordModal();
    } catch (e) {
      if (e && e.code === 'auth/wrong-password') {
        err.textContent = 'Current password is incorrect';
      } else if (e && e.code === 'auth/weak-password') {
        err.textContent = 'New password is too weak';
      } else {
        err.textContent = e && e.message ? e.message : 'Failed to change password';
      }
      err.classList.remove('hidden');
    } finally {
      this.game.setButtonBusy(saveBtn, false);
    }
  }

  async handleUserLogin(user) {
    this._preserveLoginFields = null;

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
    if (typeof window.updateCurrentUserClicks === 'function') {
      window.updateCurrentUserClicks(data.bananaClickCount || 0);
    }

    try {
      const cpBtn = document.getElementById('changePasswordBtn');
      const linkGoogleBtn = document.getElementById('linkGoogleBtn');
      const isPasswordUser = !!(user.providerData && user.providerData.some(p => p.providerId === 'password'));
      const hasGoogleProvider = !!(user.providerData && user.providerData.some(p => p.providerId === 'google.com'));
      if (cpBtn) cpBtn.classList.toggle('hidden', !isPasswordUser);
      if (linkGoogleBtn) linkGoogleBtn.classList.toggle('hidden', !(isPasswordUser && !hasGoogleProvider));
    } catch (e) { }

    document.getElementById('userInfo').classList.remove('hidden');
    this.game.resetSessionStats();
    this.game.showSection('menuSection');
    this.game.showToast('Welcome back!', 'success');

    this._wasLoggedIn = true;
  }

  handleUserLogout() {
    this.game.usernameGlobal = null;
    document.getElementById('userInfo').classList.add('hidden');
    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.classList.add('hidden');
    const linkGoogleBtn = document.getElementById('linkGoogleBtn');
    if (linkGoogleBtn) linkGoogleBtn.classList.add('hidden');
    if (typeof window.updateCurrentUserClicks === 'function') {
      window.updateCurrentUserClicks(0);
    }

    if (this.game.multiplayerManager && this.game.multiplayerManager.currentRoom) {
      this.game.multiplayerManager.cleanupRoomListeners();
      this.game.multiplayerManager.currentRoom = null;
    }

    this.game.showSection('authSection');

    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const regUsername = document.getElementById('regUsername');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');
    const preserveRegister = this._preserveRegisterFields;
    const shouldPreserveRegister = !!preserveRegister;
    const preserveLogin = this._preserveLoginFields;
    const shouldPreserveLogin = !!preserveLogin;
    const registerForm = document.getElementById('registerForm');
    const isRegisterFormVisible = registerForm && !registerForm.classList.contains('hidden');
    const loginForm = document.getElementById('loginForm');
    const isLoginFormVisible = loginForm && !loginForm.classList.contains('hidden');

    if (loginUsername) {
      if (shouldPreserveLogin) {
        loginUsername.value = preserveLogin.username || '';
      } else if (!isLoginFormVisible) {
        loginUsername.value = '';
      }
    }
    if (loginPassword) {
      if (!shouldPreserveLogin) {
        loginPassword.value = '';
      }
    }

    if (regUsername) {
      if (shouldPreserveRegister) {
        regUsername.value = preserveRegister.username || '';
      } else if (!isRegisterFormVisible) {
        regUsername.value = '';
      }
    }
    if (regEmail) {
      if (shouldPreserveRegister) {
        regEmail.value = preserveRegister.email || '';
      } else if (!isRegisterFormVisible) {
        regEmail.value = '';
      }
    }
    if (regPassword) {
      if (shouldPreserveRegister) {
        regPassword.value = preserveRegister.password || '';
      } else if (!isRegisterFormVisible) {
        regPassword.value = '';
      }
    }

    if (shouldPreserveRegister) {
      ['loginUsername', 'loginPassword'].forEach(id => this.clearFieldError(id));
      const usernameField = document.getElementById('regUsername');
      if (usernameField) usernameField.focus();
      setTimeout(() => {
        if (this._preserveRegisterFields === preserveRegister) {
          this._preserveRegisterFields = null;
        }
      }, 1000);
    } else if (shouldPreserveLogin) {
      ['loginUsername', 'loginPassword'].forEach(id => this.clearFieldError(id));
      const loginUsernameField = document.getElementById('loginUsername');
      if (loginUsernameField) loginUsernameField.focus();
      setTimeout(() => {
        if (this._preserveLoginFields === preserveLogin) {
          this._preserveLoginFields = null;
        }
      }, 1000);
    } else {
      this.clearAuthErrors();
    }

    if (this._suppressNextLogoutToast) {
      this._suppressNextLogoutToast = false;
    } else if (this._wasLoggedIn) {
      this.game.showToast('Logged out successfully');
      this._wasLoggedIn = false;
    }

    this.ensureGuestAuth();
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
    ['loginUsername', 'loginPassword', 'regUsername', 'regPassword', 'regEmail'].forEach(id => {
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

    const loginUsernameEl = document.getElementById('loginUsername');
    const loginPasswordEl = document.getElementById('loginPassword');
    if (!loginUsernameEl || !loginPasswordEl) {
      this.game.showToast('Login UI not available', 'error');
      return;
    }

    const userOrEmail = (loginUsernameEl.value || '').trim();
    const password = (loginPasswordEl.value || '').trim();

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
    if (loginButton) this.game.setButtonBusy(loginButton, true);

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

        const mapped = mapSnap.val() || {};
        if (!mapped.email) {
          this.setFieldError('loginUsername', 'This account has no email on file');
          this.game.showToast('This username cannot sign in with a password. Use the provider used to register.', 'error');
          return;
        }

        emailToUse = mapped.email;
      }

      await this.auth.signInWithEmailAndPassword(emailToUse, password);
    } catch (error) {
      this.handleAuthError(error);
    } finally {
      if (loginButton) this.game.setButtonBusy(loginButton, false);
    }
  }


  async register() {
    this.clearAuthErrors();

    const regUsernameEl = document.getElementById('regUsername');
    const regEmailEl = document.getElementById('regEmail');
    const regPasswordEl = document.getElementById('regPassword');

    if (!regUsernameEl || !regEmailEl || !regPasswordEl) {
      this.game.showToast('Registration UI not available', 'error');
      return;
    }

    const username = (regUsernameEl.value || '').trim();
    const email = (regEmailEl.value || '').trim();
    const password = (regPasswordEl.value || '').trim();
    this._preserveRegisterFields = null;

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
    if (registerButton) this.game.setButtonBusy(registerButton, true);

    let cred;
    try {
      this._blockAutoLogin = true;
      cred = await this.auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
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
        this._preserveRegisterFields = { username, email, password };
        try { await cred.user.delete(); } catch { }
        this.setFieldError('regUsername', 'That username was just taken. Pick another.');
        this.game.showToast('Username already claimed', 'error');
        return;
      }

      await this.createUserProfile(cred.user.uid, {
        username,
        email
      });

      this._suppressNextLogoutToast = true;
      this._preserveLoginFields = { username: email };
      try { await this.auth.signOut(); } catch { }

      this.showLogin();
      setTimeout(() => {
        const loginUserField = document.getElementById('loginUsername');
        if (loginUserField && (!loginUserField.value || loginUserField.value !== email)) {
          loginUserField.value = email;
        }
      }, 100);
      this.game.showToast('Account created. Please sign in to continue.', 'info');

    } catch (error) {
      if (error.code === 'PERMISSION_DENIED') {
        this._preserveRegisterFields = { username, email, password };
        this.setFieldError('regUsername', 'Username was just taken. Pick another.');
        this.game.showToast('Username already claimed', 'error');
      } else {
        this.handleAuthError(error);
      }
    } finally {
      this._blockAutoLogin = false;
      if (registerButton) this.game.setButtonBusy(registerButton, false);
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
      case 'auth/invalid-login-credentials':
        message = 'Unable to sign in with those credentials.';
        this.setFieldError('loginPassword', 'Please double-check your email/password.');
        break;
      default:
        message = 'Something went wrong. Please try again.';
    }

    this.game.showToast(message, 'error');
  }

  async logout() {
    try {
      await this.auth.signOut();
    } catch (error) {
      this.game.showToast('Logout failed', 'error');
    }
  }
}