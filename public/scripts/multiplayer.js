class MultiplayerManager {
    constructor(game) {
        this.game = game;
        this.db = game.db;
        this.auth = game.auth;

        this.currentRoom = null;
        this.roomPlayers = [];
        this.gameStarted = false;
        this.playerReady = false;
        this.currentRound = 0;
        this.totalRounds = 3;
        this.playerScores = {};
        this.roomListeners = [];
        this.timerInterval = null;
        this.roundStartTime = 0;

        this.chatListeners = [];
        this.chatRef = null;

    }

    async initializeLobby() {
        this.cleanupRoomListeners();
        this.currentRoom = null;
        this.roomPlayers = [];
        this.gameStarted = false;
        this.playerReady = false;

        document.getElementById('multiplayerRoomCode').textContent = '—';
        document.getElementById('multiplayerPlayers').innerHTML = '';
        document.getElementById('multiplayerStatus').textContent = 'Create or join a room to start playing!';
        document.getElementById('multiplayerStartBtn').classList.add('hidden');
        document.getElementById('multiplayerReadyBtn').classList.add('hidden');
        document.getElementById('multiplayerLobby').classList.remove('hidden');
        document.getElementById('multiplayerGame').classList.add('hidden');
        document.getElementById('multiplayerResults').classList.add('hidden');

        const roomCodeInput = document.getElementById('roomCodeInput');
        if (roomCodeInput) roomCodeInput.value = '';

        this.game.showSection('multiplayerLobbySection');

        const startBtn = document.getElementById('multiplayerStartBtn');
        const readyBtn = document.getElementById('multiplayerReadyBtn');

        if (startBtn) startBtn.onclick = () => this.startGame();
        if (readyBtn) readyBtn.onclick = () => this.toggleReady();

        this.game.showSection('multiplayerLobbySection');
    }

    async createRoom() {
        const user = this.auth.currentUser;
        if (!user) {
            this.game.showToast('Please log in first', 'error');
            return;
        }

        try {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            const roomData = {
                code: roomCode,
                host: user.uid,
                hostName: this.game.usernameGlobal,
                players: {
                    [user.uid]: {
                        username: this.game.usernameGlobal,
                        ready: false,
                        score: 0,
                        currentGuess: null,
                        solved: false
                    }
                },
                gameStarted: false,
                currentRound: 0,
                totalRounds: 3,
                currentPuzzle: null,
                createdAt: Date.now()
            };

            await this.db.ref('multiplayerRooms/' + roomCode).set(roomData);

            this.currentRoom = roomCode;
            this.setupRoomListeners(roomCode);
            this.game.showSection('multiplayerSection');
            this.game.showToast(`Room ${roomCode} created!`, 'success');

        } catch (error) {
            console.error('Room creation error:', error);
            this.game.showToast('Failed to create room', 'error');
            this.game.showSection('multiplayerLobbySection');
        }
    }

    async joinRoom(roomCode = null) {
        const user = this.auth.currentUser;
        if (!user) {
            this.game.showToast('Please log in first', 'error');
            return;
        }

        if (!roomCode) {
            roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
            if (!roomCode) {
                this.game.showToast('Please enter a room code', 'error');
                return;
            }
        }

        try {
            const roomRef = this.db.ref('multiplayerRooms/' + roomCode);
            const roomSnapshot = await roomRef.once('value');

            if (!roomSnapshot.exists()) {
                this.game.showToast('Room not found', 'error');
                return;
            }

            const roomData = roomSnapshot.val();

            if (roomData.gameStarted) {
                this.game.showToast('Game already in progress', 'error');
                return;
            }

            await roomRef.child('players/' + user.uid).set({
                username: this.game.usernameGlobal,
                ready: false,
                score: 0,
                currentGuess: null,
                solved: false
            });

            this.currentRoom = roomCode;
            this.setupRoomListeners(roomCode);
            this.game.showSection('multiplayerSection');
            this.game.showToast(`Joined room ${roomCode}`, 'success');

        } catch (error) {
            console.error('Room join error:', error);
            this.game.showToast('Failed to join room', 'error');
            this.game.showSection('multiplayerLobbySection');
        }
    }

    setupRoomListeners(roomCode) {
        this.cleanupRoomListeners();

        const roomRef = this.db.ref('multiplayerRooms/' + roomCode);

        this.initChat(roomCode);

        const roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                this.handleRoomDeleted();
                return;
            }
            this.updateRoomUI(roomData);
        });

        this.roomListeners.push(() => roomRef.off('value', roomListener));
    }

    cleanupRoomListeners() {
        this.roomListeners.forEach(cleanup => cleanup && cleanup());
        this.roomListeners = [];

        this.chatListeners.forEach(off => off && off());
        this.chatListeners = [];
        this.chatRef = null;
    }

    hideResultsPanel() {
        const res = document.getElementById('multiplayerResults');
        if (res) res.classList.add('hidden');
        const list = document.getElementById('multiplayerResultsList');
        if (list) list.innerHTML = '';
    }

    showResultsPanel() {
        const res = document.getElementById('multiplayerResults');
        if (res) res.classList.remove('hidden');
    }


    updateRoomUI(roomData) {
        const roomCodeEl = document.getElementById('multiplayerRoomCode');
        if (roomCodeEl) roomCodeEl.textContent = roomData.code || '—';

        const playersObj = roomData.players || {};
        const playersArr = Object.values(playersObj);
        this.roomPlayers = playersArr;

        const playersContainer = document.getElementById('multiplayerPlayers');
        if (playersContainer) {
            playersContainer.innerHTML = '';
            playersArr.forEach(player => {
                const isYou = player.username === this.game.usernameGlobal;
                const li = document.createElement('div');
                li.className = `flex justify-between items-center p-3 rounded-lg ${isYou ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-gray-100 dark:bg-gray-700'
                    }`;
                li.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="w-3 h-3 rounded-full ${player.ready ? 'bg-green-500' : 'bg-gray-400'}"></span>
          <span class="font-medium ${isYou ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}">
            ${player.username} ${isYou ? '(You)' : ''}
          </span>
        </div>
        <span class="font-bold text-yellow-600 dark:text-yellow-400">${player.score || 0} pts</span>
      `;
                playersContainer.appendChild(li);
            });
        }

        this.gameStarted = !!roomData.gameStarted;
        this.currentRound = roomData.currentRound || 0;

        if (roomData.gameCompleted) {
            this.clearRoundTimer();

            const statusEl = document.getElementById('multiplayerStatus');
            statusEl?.classList.remove('hidden');
            if (statusEl) statusEl.textContent = 'Game finished — results below';

            const scoresObj = roomData.finalScores || roomData.players || {};
            const winnerObj = { username: roomData.winner || '' };

            this.showResultsPanel?.();
            this.showGameResults(scoresObj, winnerObj);
            return;
        }

        this.hideResultsPanel?.();

        const incomingStart =
            typeof roomData.roundStartTime === 'number' ? roomData.roundStartTime : null;

        if (this.gameStarted) {
            if (incomingStart && incomingStart !== this.roundStartTime) {
                this.roundStartTime = incomingStart;
                this.clearRoundTimer();
                this.startRoundTimer();
            } else if (!this.timerInterval && incomingStart) {
                this.roundStartTime = incomingStart;
                this.startRoundTimer();
            }
        } else {
            this.clearRoundTimer();
            this.roundStartTime = incomingStart;
        }

        const me = this.auth.currentUser;
        const meData = me ? playersObj[me.uid] : null;
        this.playerReady = !!(meData && meData.ready);

        const statusEl = document.getElementById('multiplayerStatus');
        const lobbyEl = document.getElementById('multiplayerLobby');
        const gameEl = document.getElementById('multiplayerGame');

        if (this.gameStarted) {
            statusEl?.classList.add('hidden');

            lobbyEl?.classList.add('hidden');
            gameEl?.classList.remove('hidden');

            const roundInfoEl = document.getElementById('multiplayerRoundInfo');
            if (roundInfoEl) {
                roundInfoEl.textContent = `Round ${this.currentRound + 1} of ${roomData.totalRounds || 3}`;
            }

            if (roomData.currentPuzzle) {
                this.displayCurrentPuzzle(roomData.currentPuzzle);
            }
            this.updateGameUI(roomData);

            if (typeof this.hostAdvanceOnFirstCorrect === 'function') {
                this.hostAdvanceOnFirstCorrect(roomData);
            }
        } else {
            statusEl?.classList.remove('hidden');
            lobbyEl?.classList.remove('hidden');
            gameEl?.classList.add('hidden');

            const readyBtn = document.getElementById('multiplayerReadyBtn');
            const startBtn = document.getElementById('multiplayerStartBtn');

            if (readyBtn) {
                readyBtn.classList.remove('hidden');
                readyBtn.textContent = this.playerReady ? '❌ Not Ready' : '✅ Ready Up';
            }

            const readyCount = playersArr.filter(p => p.ready === true).length;
            const allReady = playersArr.length >= 2 && readyCount === playersArr.length;

            if (statusEl) {
                statusEl.textContent = `Waiting for players (${playersArr.length}/4) • Ready ${readyCount}/${playersArr.length}`;
            }

            const isHost = !!(me && roomData.host === me.uid);

            if (startBtn) {
                startBtn.classList.toggle('hidden', !isHost);
                if (isHost) {
                    startBtn.disabled = !allReady;
                    startBtn.textContent = allReady ? '🚀 Start Game' : '⏳ Waiting for Ready…';
                    startBtn.classList.toggle('opacity-50', !allReady);
                    startBtn.classList.toggle('pointer-events-none', !allReady);
                }
            }
        }
    }

    async playAgainSameRoom() {
        if (!this.currentRoom) return;

        const user = this.auth.currentUser;
        if (!user) {
            this.game.showToast('Please log in first', 'error');
            return;
        }

        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);

        try {
            const snap = await roomRef.once('value');
            const roomData = snap.val();
            if (!roomData) return;

            if (roomData.gameStarted) {
                this.game.showToast('Game already in progress', 'warning');
                return;
            }

            const tokenRef = roomRef.child('rematchToken');
            const txn = await tokenRef.transaction(curr => (curr == null ? user.uid : curr));
            if (!(txn && txn.committed && txn.snapshot.val() === user.uid)) {
                this.game.showToast('Rematch starting…', 'info');
                return;
            }

            const playerUpdates = {};
            Object.keys(roomData.players || {}).forEach(uid => {
                playerUpdates[`players/${uid}/score`] = 0;
                playerUpdates[`players/${uid}/ready`] = false;
                playerUpdates[`players/${uid}/currentGuess`] = null;
                playerUpdates[`players/${uid}/solved`] = false;
            });

            await roomRef.update({
                ...playerUpdates,
                gameCompleted: false,
                winner: null,
                finalScores: null,
                gameStarted: false,
                currentRound: 0,
                currentPuzzle: null,
                roundStartTime: null,
                roundAdvanceToken: null,
            });

            this.hideResultsPanel?.();

            this.game.showToast('Rematch ready — get everyone to Ready Up!', 'success');
        } catch (e) {
            console.error('playAgainSameRoom error:', e);
            this.game.showToast('Failed to set up rematch', 'error');
        }
    }

    async toggleReady() {
        const user = this.auth.currentUser;
        if (!user || !this.currentRoom) return;

        try {
            const playerRef = this.db.ref(`multiplayerRooms/${this.currentRoom}/players/${user.uid}/ready`);
            await playerRef.set(!this.playerReady);
            this.game.playSound('click');
        } catch (error) {
            console.error('Toggle ready error:', error);
        }
    }

    async startGame() {
        if (!this.currentRoom) return;

        const user = this.auth.currentUser;
        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);

        try {
            const snap = await roomRef.once('value');
            const roomData = snap.val();
            if (!roomData) return;

            if (roomData.host !== user.uid) {
                this.game.showToast('Only the host can start the game', 'error');
                return;
            }

            if (roomData.gameStarted) {
                this.game.showToast('Game already in progress', 'warning');
                return;
            }

            const playersArr = Object.values(roomData.players || {});
            const readyCount = playersArr.filter(p => p.ready === true).length;
            const allReady = playersArr.length >= 2 && readyCount === playersArr.length;

            if (!allReady) {
                this.game.showToast('All players must be ready (min 2 players)', 'error');
                return;
            }

            const puzzleData = await this.game.fetchBananaPuzzle();

            await roomRef.update({
                gameStarted: true,
                currentRound: 0,
                currentPuzzle: puzzleData,
                roundStartTime: firebase.database.ServerValue.TIMESTAMP,
                roundAdvanceToken: null
            });

            this.hideResultsPanel?.();

            this.game.showToast('Game started!', 'success');

        } catch (error) {
            console.error('Start game error:', error);
            this.game.showToast('Failed to start game', 'error');
        }
    }

    async submitGuess() {
        const user = this.auth.currentUser;
        if (!user || !this.currentRoom || !this.gameStarted) return;

        const guessEl = document.getElementById('multiplayerGuess');
        if (!guessEl) return;

        const raw = (guessEl.value ?? '').toString().trim();
        const guess = Number(raw);
        if (Number.isNaN(guess)) {
            this.game.showToast('Enter a valid number', 'error');
            return;
        }

        try {
            const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
            const roomSnapshot = await roomRef.once('value');
            const roomData = roomSnapshot.val();

            if (!roomData || !roomData.currentPuzzle) return;

            const isCorrect = guess === roomData.currentPuzzle.answer;
            const solveTime = Math.floor((Date.now() - (roomData.roundStartTime || Date.now())) / 1000);

            const basePoints = 10;
            const speedBonus = Math.max(0, 5 - Math.floor(solveTime / 10));
            const points = isCorrect ? basePoints + speedBonus : 0;

            await roomRef.child('players/' + user.uid).update({
                currentGuess: guess,
                solved: isCorrect
            });
            await roomRef.child('players/' + user.uid + '/score').transaction(prev => (prev == null ? points : prev + points));


            if (isCorrect) {
                this.game.playSound('correct');
                this.game.showToast(`Correct! +${points} points`, 'success');
            } else {
                this.game.playSound('wrong');
                this.game.showToast('Incorrect!', 'error');
            }

            guessEl.value = '';

            await this.checkRoundCompletion(roomData);

        } catch (error) {
            console.error('Multiplayer guess error:', error);
            this.game.showToast('Submission failed', 'error');
        }
    }

    async checkRoundCompletion(roomData) {
        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
        const freshSnap = await roomRef.once('value');
        const fresh = freshSnap.val();
        if (!fresh) return;

        const players = Object.values(fresh.players || {});
        const allSolved = players.every(p => p.solved === true);
        const timedOut = fresh.roundStartTime && (Date.now() - fresh.roundStartTime) > 60000;

        if (allSolved || timedOut) {
            await this.nextRound(fresh);
        }
    }

    async nextRound(roomData) {
        const user = this.game.auth.currentUser;
        if (roomData.host !== user.uid) return;
        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
        const nextRound = (roomData.currentRound || 0) + 1;

        if (nextRound >= (roomData.totalRounds || 3)) {
            await this.endGame(roomData);
            return;
        }

        const puzzleData = await this.game.fetchBananaPuzzle();

        const playerUpdates = {};
        Object.keys(roomData.players || {}).forEach(uid => {
            playerUpdates[`players/${uid}/currentGuess`] = null;
            playerUpdates[`players/${uid}/solved`] = false;
        });

        await roomRef.update({
            ...playerUpdates,
            currentRound: nextRound,
            currentPuzzle: puzzleData,
            roundStartTime: firebase.database.ServerValue.TIMESTAMP,
            roundAdvanceToken: null
        });

        this.game.showToast(`Round ${nextRound + 1} started!`, 'success');
    }

    async endGame(roomData) {
        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);

        const players = Object.values(roomData.players || {});
        const winner = players.reduce((prev, current) =>
            (prev.score > current.score) ? prev : current
        );

        await roomRef.update({
            gameStarted: false,
            gameCompleted: true,
            winner: winner.username,
            finalScores: roomData.players
        });

        this.game.showToast(`Game over! Winner: ${winner.username}`, 'success');

        this.showGameResults(roomData.players, winner);

        await this.recordMultiplayerGame(roomData.players, winner);
    }

    async hostAdvanceOnFirstCorrect(roomData) {
        const me = this.auth.currentUser;
        if (!me || roomData.host !== me.uid) return;

        const playersArr = Object.values(roomData.players || {});
        if (playersArr.length < 2) return;

        const someoneSolved = playersArr.some(p => p.solved === true);
        if (!someoneSolved) return;

        const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
        const tokenRef = roomRef.child('roundAdvanceToken');

        try {
            const txn = await tokenRef.transaction(curr => (curr == null ? me.uid : curr));
            if (txn && txn.committed && txn.snapshot && txn.snapshot.val() === me.uid) {
                const freshSnap = await roomRef.once('value');
                const fresh = freshSnap.val();
                if (!fresh) return;

                const nextRoundIndex = (fresh.currentRound || 0) + 1;
                if (nextRoundIndex >= (fresh.totalRounds || 3)) {
                    await this.endGame(fresh);
                } else {
                    await this.nextRound(fresh);
                }
            }
        } catch (e) {
            console.error('Host auto-advance failed:', e);
        }
    }

    showGameResults(scores, winner) {
        document.getElementById('multiplayerGame').classList.add('hidden');
        document.getElementById('multiplayerResults').classList.remove('hidden');

        const resultsList = document.getElementById('multiplayerResultsList');
        resultsList.innerHTML = '';

        const sortedPlayers = Object.values(scores).sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            const isWinner = player.username === winner.username;
            const playerElement = document.createElement('div');
            playerElement.className = `flex justify-between items-center p-4 rounded-lg ${isWinner ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-gray-100 dark:bg-gray-700'
                } ${isWinner ? 'border-2 border-yellow-400' : ''}`;

            playerElement.innerHTML = `
                <div class="flex items-center space-x-3">
                    <span class="text-xl font-bold ${isWinner ? 'text-yellow-600' : 'text-gray-600'}">
                        ${index + 1}.
                    </span>
                    <span class="font-medium text-lg ${isWinner ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}">
                        ${player.username} ${player.username === this.game.usernameGlobal ? '(You)' : ''}
                        ${isWinner ? '👑' : ''}
                    </span>
                </div>
                <span class="font-bold text-lg text-yellow-600 dark:text-yellow-400">${player.score || 0} pts</span>
            `;

            resultsList.appendChild(playerElement);
        });

        if (winner.username === this.game.usernameGlobal) {
            this.game.claimAchievement('MULTIPLAYER_WIN');
        }
    }

    async recordMultiplayerGame(scores, winner) {
        const user = this.auth.currentUser;
        if (!user) return;

        const gameRef = this.db.ref('multiplayerGames').push();
        await gameRef.set({
            roomCode: this.currentRoom,
            players: scores,
            winner: winner.username,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            rounds: this.totalRounds
        });

        const userScore = scores[user.uid]?.score || 0;
        const userRef = this.db.ref('users/' + user.uid);
        await userRef.update({
            totalScore: firebase.database.ServerValue.increment(userScore),
            multiplayerGames: firebase.database.ServerValue.increment(1),
            multiplayerWins: firebase.database.ServerValue.increment(winner.username === this.game.usernameGlobal ? 1 : 0)
        });
    }

    displayCurrentPuzzle(puzzleData) {
        const img = document.getElementById('multiplayerImage');
        if (img && puzzleData.imageUrl) {
            img.src = puzzleData.imageUrl;
            img.alt = 'Multiplayer banana puzzle';
        }
    }

    handleRoomDeleted() {
        this.game.showToast('Room was closed by host', 'warning');
        this.leaveRoom();
    }

    async leaveRoom() {
        const user = this.auth.currentUser;

        if (this.currentRoom && user) {
            try {
                await this.db.ref(`multiplayerRooms/${this.currentRoom}/players/${user.uid}`).remove();

                const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
                const roomSnapshot = await roomRef.once('value');
                const roomData = roomSnapshot.val();

                if (roomData && roomData.host === user.uid) {
                    await roomRef.remove();
                }
            } catch (error) {
                console.error('Leave room error:', error);
            }
        }

        this.cleanupRoomListeners();
        this.currentRoom = null;
        this.roomPlayers = [];
        this.gameStarted = false;
        this.playerReady = false;

        this.clearRoundTimer();
        this.game.showSection('multiplayerLobbySection');
        this.game.showToast('Left the room', 'info');

        const list = document.getElementById('mpChatList');
        if (list) list.innerHTML = '';
        const inp = document.getElementById('mpChatInput');
        if (inp) inp.value = '';

    }

    initChat(roomCode) {
        const listEl = document.getElementById('mpChatList');
        const inputEl = document.getElementById('mpChatInput');
        const sendBtn = document.getElementById('mpChatSendBtn');

        if (!listEl || !inputEl || !sendBtn) return;

        listEl.innerHTML = '';

        this.chatRef = this.db.ref(`multiplayerRooms/${roomCode}/chat`).orderByChild('ts').limitToLast(50);

        const onAdd = this.chatRef.on('child_added', (snap) => {
            const msg = snap.val();
            if (!msg) return;
            this.renderChatMessage(msg);
        });

        this.chatListeners.push(() => this.chatRef && this.chatRef.off('child_added', onAdd));

        sendBtn.onclick = () => this.sendChat(inputEl);

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChat(inputEl);
            }
        };
    }

    sendChat(inputEl) {
        const user = this.auth.currentUser;
        if (!user || !this.currentRoom || !this.chatRef) return;

        const raw = (inputEl.value || '').trim();
        if (!raw) return;

        const text = raw.replace(/\s+/g, ' ').slice(0, 300);

        const username = this.game.usernameGlobal || user.displayName || (user.email || 'User').split('@')[0];

        const roomChatRoot = this.db.ref(`multiplayerRooms/${this.currentRoom}/chat`);
        roomChatRoot.push({
            uid: user.uid,
            username,
            text,
            ts: Date.now()
        }).catch(err => {
            console.error('chat send failed:', err);
            this.game.showToast('Message failed to send', 'error');
        });

        inputEl.value = '';
    }

    renderChatMessage(msg) {
        const listEl = document.getElementById('mpChatList');
        if (!listEl) return;

        const isMe = this.auth.currentUser && msg.uid === this.auth.currentUser.uid;

        const row = document.createElement('div');
        row.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;

        const bubble = document.createElement('div');
        bubble.className = [
            'max-w-[85%] md:max-w-[75%] px-3 py-2 rounded-xl text-sm md:text-base shadow',
            isMe
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-br-sm'
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-yellow-200 dark:border-gray-700 rounded-bl-sm'
        ].join(' ');

        const name = document.createElement('div');
        name.className = `text-[11px] md:text-xs mb-0.5 ${isMe ? 'opacity-90' : 'text-gray-600 dark:text-gray-300'}`;
        name.textContent = isMe ? 'You' : msg.username;

        const text = document.createElement('div');
        text.textContent = msg.text;

        const time = document.createElement('div');
        time.className = 'mt-0.5 text-[10px] opacity-60';
        time.textContent = this.formatTime(msg.ts);

        if (!isMe) bubble.appendChild(name);
        bubble.appendChild(text);
        bubble.appendChild(time);
        row.appendChild(bubble);
        listEl.appendChild(row);

        listEl.scrollTop = listEl.scrollHeight;

        if (!isMe) {
            try { this.game.playSound?.('click'); } catch { }
        }
    }

    formatTime(ts) {
        try {
            const d = new Date(ts || Date.now());
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${hh}:${mm}`;
        } catch {
            return '';
        }
    }

    updateLiveScores(roomData) {
        const scoresContainer = document.getElementById('multiplayerLiveScores');
        if (!scoresContainer) return;

        const players = Object.values(roomData.players || {});
        players.sort((a, b) => (b.score || 0) - (a.score || 0));

        scoresContainer.innerHTML = '';

        players.forEach((player, index) => {
            const scoreElement = document.createElement('li');
            scoreElement.className = `flex justify-between items-center p-2 rounded-lg ${player.username === this.game.usernameGlobal ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-gray-100 dark:bg-gray-700'
                }`;

            const statusIcon = player.solved ? '✅' : '⏳';

            scoreElement.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="font-bold ${index === 0 ? 'text-yellow-600' : 'text-gray-600'}">
                    ${index + 1}.
                </span>
                <span class="font-medium ${player.username === this.game.usernameGlobal ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}">
                    ${player.username}
                </span>
                <span class="text-sm">${statusIcon}</span>
            </div>
            <span class="font-bold text-yellow-600 dark:text-yellow-400">${player.score || 0} pts</span>
        `;

            scoresContainer.appendChild(scoreElement);
        });
    }

    updateGameUI(roomData) {
        const user = this.auth.currentUser;

        if (!user) return;

        const currentPlayer = roomData.players[user.uid];

        if (currentPlayer) {
            document.getElementById('multiplayerPlayerScore').textContent = currentPlayer.score || 0;
            document.getElementById('multiplayerPlayerStatus').textContent =
                currentPlayer.solved ? '✅ Solved!' : '⏳ Thinking...';

            document.getElementById('multiplayerRoundInfo').textContent =
                `Round ${(roomData.currentRound || 0) + 1} of ${roomData.totalRounds || 3}`;
        }

        this.updateLiveScores(roomData);
    }

    startRoundTimer() {
        if (this.timerInterval) return;
        const total = 60;
        this.timerInterval = setInterval(() => {
            const start = this.roundStartTime || Date.now();
            const elapsed = (Date.now() - start) / 1000;
            const remaining = Math.max(0, total - elapsed);
            const timeEl = document.getElementById('mpTimeRemaining');
            const barEl = document.getElementById('mpTimerBar');
            if (timeEl) timeEl.textContent = `${Math.floor(remaining)}s`;
            if (barEl) {
                const pct = (remaining / total) * 100;
                barEl.style.width = `${pct}%`;
                barEl.style.background = pct <= 30
                    ? 'linear-gradient(90deg,#ff9800,#f44336)'
                    : 'linear-gradient(90deg,#81c784,#4caf50)';
            }
            if (remaining <= 0) {
                this.clearRoundTimer();
            }
        }, 1000);
    }

    clearRoundTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        const barEl = document.getElementById('mpTimerBar');
        if (barEl) barEl.style.width = '100%';
    }
}