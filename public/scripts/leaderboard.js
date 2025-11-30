class LeaderboardManager {
  constructor(game) {
    this.game = game;
    this.db = game.db;
    this.currentPage = 1;
    this.pageSize = 10;

    this._refreshing = false;
    this.timeframe = 'all';
  }

  async refreshGlobal() {
    if (this._refreshing) return;
    this._refreshing = true;

    const tfLabel = document.getElementById('lbTimeframe');
    const refreshIcon = document.getElementById('lbRefreshIcon');
    const spinTarget = refreshIcon || tfLabel?.nextElementSibling;

    const original = tfLabel ? tfLabel.textContent : '';
    if (tfLabel) tfLabel.textContent = 'Refreshing…';
    spinTarget?.classList.add('animate-spin');

    try {
      await this.loadLeaderboard();
    } catch (e) {
      console.error(e);
      this.game.showToast('Refresh failed. Try again.', 'error');
    } finally {
      if (tfLabel) tfLabel.textContent = original || 'All Time';
      spinTarget?.classList.remove('animate-spin');
      this._refreshing = false;
    }
  }

  async loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<li class="text-center text-gray-500 py-4"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div><p class="mt-2">Loading leaderboard...</p></li>';

    try {
      const user = this.game.auth?.currentUser;
      if (!user || user.isAnonymous) {
        list.innerHTML = '<li class="text-center text-yellow-600 dark:text-yellow-400 py-4">Sign in to view the leaderboard.</li>';
        this.game.showToast('Sign in to view the leaderboard.', 'warning');
        this.game._pendingLeaderboardLoad = true;
        return;
      }

      const topSnap = await this.db.ref('users')
        .orderByChild('totalScore')
        .limitToLast(this.pageSize)
        .once('value');

      const topPlayers = [];
      topSnap.forEach(cs => {
        const v = cs.val() || {};
        const username =
          v.username ||
          v.email?.split('@')[0] ||
          v.displayName ||
          'Player';

        topPlayers.push({
          uid: cs.key,
          username,
          totalScore: v.totalScore || 0,
          bestStreak: v.bestStreak || 0
        });
      });
      topPlayers.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

      let yourRow = null;

      if (user) {
        const allSnap = await this.db.ref('users').once('value');
        const everyone = [];
        allSnap.forEach(cs => {
          const v = cs.val() || {};
          const username =
            v.username ||
            v.email?.split('@')[0] ||
            v.displayName ||
            'Player';
          everyone.push({
            uid: cs.key,
            username,
            totalScore: v.totalScore || 0
          });
        });
        everyone.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
        const idx = everyone.findIndex(p => p.uid === user.uid);
        if (idx !== -1) {
          yourRow = {
            rank: idx + 1,
            uid: user.uid,
            username: everyone[idx].username,
            totalScore: everyone[idx].totalScore || 0
          };
        }
      }

      this.displayLeaderboard(topPlayers, yourRow);

      if (yourRow) {
        this.updateUserRankBox({ rank: yourRow.rank, score: yourRow.totalScore });
      } else if (user) {
        const idxInTop = topPlayers.findIndex(p => p.uid === user.uid);
        if (idxInTop !== -1) {
          const mine = topPlayers[idxInTop];
          this.updateUserRankBox({ rank: idxInTop + 1, score: mine.totalScore || 0 });
        } else {
          this.updateUserRankBox();
        }
      } else {
        this.updateUserRankBox();
      }

      this.game.showSection('leaderboardSection');
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      list.innerHTML = '<li class="text-center text-red-500 py-4"><p class="mb-2">❌ Failed to load leaderboard</p><button onclick="window.game.leaderboardManager.loadLeaderboard()" class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">Retry</button></li>';
      this.game.showToast('Failed to load leaderboard. Please check your connection.', 'error');
    }
  }

  updateUserRankBox({ rank, score } = {}) {
    const posEl = document.getElementById('userRankPosition');
    const scoreEl = document.getElementById('userRankScore');
    const badgeEl = document.getElementById('userRankBadge');
    if (badgeEl) badgeEl.textContent = Number.isFinite(rank) ? String(rank) : '#';
    if (!posEl || !scoreEl) return;

    if (Number.isFinite(rank)) {
      posEl.textContent = `#${rank}`;
      scoreEl.textContent = `${Math.max(0, score || 0)} pts`;
    } else {
      posEl.textContent = '-';
      scoreEl.textContent = '0 pts';
    }
  }

  displayLeaderboard(players, yourRow = null) {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    if (players.length === 0) {
      list.innerHTML = '<li class="text-center text-gray-500 py-4">No players yet. Be the first to play!</li>';
      return;
    }

    const user = this.game.auth.currentUser;
    players.forEach((player, index) => {
      const rank = index + 1;
      const isYou = user && player.uid === user.uid;

      const item = document.createElement('li');
      item.className = `flex justify-between items-center p-3 rounded-lg ${isYou ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-gray-100 dark:bg-gray-700'
        }`;

      item.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="font-bold ${rank <= 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300'}">
          ${rank}.
        </span>
        <span class="font-medium ${isYou ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}">
          ${player.username} ${isYou ? '(You)' : ''}
        </span>
      </div>
      <span class="font-bold text-yellow-600 dark:text-yellow-400">${player.totalScore || 0} pts</span>
    `;
      list.appendChild(item);
    });

    if (yourRow) {
      const youVisible = players.some(p => p.uid === yourRow.uid);
      if (!youVisible) {
        const sep = document.createElement('li');
        sep.className = 'text-center text-xs text-gray-400 my-2';
        sep.textContent = '— Your Rank —';
        list.appendChild(sep);

        const you = document.createElement('li');
        you.className = 'flex justify-between items-center p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900 border border-yellow-300';
        you.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="font-bold text-yellow-600 dark:text-yellow-400">${yourRow.rank}.</span>
          <span class="font-medium text-yellow-700 dark:text-yellow-300">${yourRow.username} (You)</span>
        </div>
        <span class="font-bold text-yellow-600 dark:text-yellow-400">${yourRow.totalScore} pts</span>
      `;
        list.appendChild(you);
      }
    }
  }

  async loadDailyLeaderboard() {
    const list = document.getElementById('dailyLb');
    list.innerHTML = '<li class="text-center text-gray-500 py-4"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div></li>';

    try {
      const user = this.game.auth?.currentUser;
      if (!user || user.isAnonymous) {
        list.innerHTML = '<li class="text-center text-yellow-600 dark:text-yellow-400 py-4">Sign in to view daily standings.</li>';
        this.game.showToast('Sign in to view the daily leaderboard.', 'warning');
        this.game._pendingLeaderboardLoad = true;
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startTs = today.getTime();

      const snapshot = await this.db.ref('gameSessions')
        .orderByChild('timestamp')
        .startAt(startTs)
        .limitToLast(100)
        .once('value');

      const byUser = new Map();

      snapshot.forEach(childSnapshot => {
        const s = childSnapshot.val();
        if (!s || !s.userId) return;
        if (s.timestamp < startTs) return;
        if (s.mode !== 'daily') return;

        const prev = byUser.get(s.userId);
        const score = s.points || 0;

        if (!prev || score > prev.score) {
          byUser.set(s.userId, {
            userId: s.userId,
            username: s.username,
            score: score,
            timestamp: s.timestamp
          });
        }
      });

      const rows = Array.from(byUser.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      this.displayDailyLeaderboard(rows);

      const info = document.getElementById('dailyPageInfo');
      if (info) info.textContent = `Page ${this.game.dailyPageNum}`;
    } catch (error) {
      console.error('Failed to load daily leaderboard:', error);
      list.innerHTML = '<li class="text-center text-red-500 py-4"><p class="mb-2">❌ Failed to load</p><button onclick="window.game.leaderboardManager.loadDailyLeaderboard()" class="px-3 py-1 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">Retry</button></li>';
      this.game.showToast('Failed to load daily leaderboard', 'error');
    }
  }

  displayDailyLeaderboard(players) {
    const list = document.getElementById('dailyLb');
    list.innerHTML = '';

    if (players.length === 0) {
      list.innerHTML = '<li class="text-center text-gray-500 py-4">No daily entries yet. Play today to appear here!</li>';
      return;
    }

    const currentUid = this.game.auth?.currentUser?.uid || null;

    players.forEach((player, index) => {
      const rank = index + 1;
      const isCurrentUser = currentUid && (player.userId === currentUid);
      const fallbackYou = this.game.usernameGlobal
        || this.game.auth?.currentUser?.displayName
        || (this.game.auth?.currentUser?.email ? this.game.auth.currentUser.email.split('@')[0] : 'You');
      const displayName = player.username || (isCurrentUser ? fallbackYou : 'Player');

      const item = document.createElement('li');
      item.className = `flex justify-between items-center p-3 rounded-lg ${isCurrentUser ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-gray-100 dark:bg-gray-700'
        }`;

      item.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="font-bold ${rank <= 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300'}">
          ${rank}.
        </span>
        <span class="font-medium ${isCurrentUser ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}">
          ${displayName} ${isCurrentUser ? '(You)' : ''}
        </span>
      </div>
      <div class="text-right">
        <div class="font-bold text-yellow-600 dark:text-yellow-400">${player.score || 0} pts</div>
      </div>
    `;

      list.appendChild(item);
    });
  }

  dailyPage(delta) {
    this.game.dailyPageNum += delta;
    if (this.game.dailyPageNum < 1) this.game.dailyPageNum = 1;
    this.loadDailyLeaderboard();
  }

  async loadFriendsLeaderboardAllTime() {
    const me = this.game.auth.currentUser;
    if (!me) {
      this.game.showToast('Log in to see friends leaderboard', 'warning');
      return;
    }

    const friendsSnap = await this.db.ref(`friends/${me.uid}/friends`).once('value');
    const friendsMap = friendsSnap.val() || {};

    const friendIds = Object.keys(friendsMap).filter(uid => friendsMap[uid]);
    if (!friendIds.includes(me.uid)) friendIds.push(me.uid);

    if (!friendIds.includes(me.uid)) friendIds.push(me.uid);
    const reads = friendIds.map(uid => this.db.ref(`users/${uid}`).once('value'));
    const snaps = await Promise.all(reads);

    const players = snaps.map(s => {
      const v = s.val() || {};
      const username = v.username || v.displayName || (v.email ? v.email.split('@')[0] : 'Player');
      return {
        uid: s.key,
        username,
        totalScore: v.totalScore || 0
      };
    });

    players.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

    const idx = players.findIndex(p => p.uid === me.uid);
    const yourRow = (idx !== -1) ? { rank: idx + 1, uid: me.uid, username: players[idx].username, totalScore: players[idx].totalScore } : null;

    this.displayLeaderboard(players, yourRow);
    if (yourRow) this.updateUserRankBox({ rank: yourRow.rank, score: yourRow.totalScore }); else this.updateUserRankBox();
  }

  async loadFriendsLeaderboardToday() {
    const me = this.game.auth.currentUser;
    if (!me) {
      this.game.showToast('Log in to see friends leaderboard', 'warning');
      return;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startTs = today.getTime();

    const friendsSnap = await this.db.ref(`friends/${me.uid}/friends`).once('value');
    const friendsMap = friendsSnap.val() || {};
    const friendIds = Object.keys(friendsMap).filter(uid => friendsMap[uid]);
    if (!friendIds.includes(me.uid)) friendIds.push(me.uid);

    const sessionsSnap = await this.db.ref('gameSessions')
      .orderByChild('timestamp')
      .startAt(startTs)
      .limitToLast(500)
      .once('value');

    const bestByUser = new Map();
    sessionsSnap.forEach(cs => {
      const s = cs.val();
      if (!s || !s.userId || s.timestamp < startTs) return;
      if (!friendIds.includes(s.userId)) return;

      const prev = bestByUser.get(s.userId);
      const score = s.points || 0;
      if (!prev || score > prev.score) {
        bestByUser.set(s.userId, {
          uid: s.userId,
          username: s.username || 'Player',
          score
        });
      }
    });

    const rows = Array.from(bestByUser.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const players = rows.map(r => ({ uid: r.uid, username: r.username, totalScore: r.score }));
    const idx = rows.findIndex(r => r.uid === me.uid);
    const yourRow = (idx !== -1)
      ? { rank: rows[idx].rank, uid: me.uid, username: rows[idx].username, totalScore: rows[idx].score }
      : null;

    this.displayLeaderboard(players, yourRow);
    if (yourRow) this.updateUserRankBox({ rank: yourRow.rank, score: yourRow.totalScore }); else this.updateUserRankBox();
  }

  async onAuthReady() {
    if (this.game._pendingLeaderboardLoad) {
      this.game._pendingLeaderboardLoad = false;
      try {
        await this.loadLeaderboard();
        await this.loadDailyLeaderboard();
      } catch (e) {
      }
    }
  }
}