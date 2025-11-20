class MultiplayerManager {
    matchmakingQueueRef = null;
    matchmakingDisconnectRef = null;

    static GIPHY_API_KEY = 'Xfe5LwxHwFbmfi7IAVXBMfwaI1NE48uu';

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

    async playOnline() {
        const user = this.auth.currentUser;
        if (!user) {
            this.game.showToast('Please log in first', 'error');
            return;
        }

        this.game.showSection('multiplayerSection');
        const statusEl = document.getElementById('multiplayerStatus');
        if (statusEl) statusEl.textContent = 'Waiting for an opponent...';

        const queueRef = this.db.ref('matchmakingQueue');
        const myQueueRef = queueRef.child(user.uid);
        const matchmakingRoomsRef = this.db.ref('matchmakingRooms');

        const queueSnap = await queueRef.once('value');
        const queue = queueSnap.val() || {};
        const others = Object.keys(queue).filter(uid => uid !== user.uid);

        if (others.length > 0) {
            const hostUid = others[0];
            const hostEntry = queue[hostUid];
            const roomCode = hostEntry.roomCode;
            if (!roomCode) {
                this.game.showToast('Error: Host has no room code.', 'error');
                return;
            }
            await myQueueRef.remove();
            const roomRef = this.db.ref('multiplayerRooms/' + roomCode);
            await roomRef.child('players/' + user.uid).set({
                username: this.game.usernameGlobal,
                ready: false,
                score: 0,
                currentGuess: null,
                solved: false
            });
            this.currentRoom = roomCode;
            this.setupRoomListeners(roomCode);
            if (statusEl) statusEl.textContent = 'Player has joined!';
            this.game.showToast(`Match found! Room ${roomCode}`, 'success');
        } else {
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
            const userData = {
                uid: user.uid,
                username: this.game.usernameGlobal,
                ts: Date.now(),
                roomCode: roomCode
            };
            await myQueueRef.set(userData);
            if (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) {
                myQueueRef.onDisconnect().remove();
            }
            this.matchmakingQueueRef = myQueueRef;
            this.currentRoom = roomCode;
            this.setupRoomListeners(roomCode);
            if (statusEl) statusEl.textContent = 'Waiting for an opponent...';
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

        if (!this._prevPlayerIds) this._prevPlayerIds = Object.keys(playersObj);
        const prevPlayerIds = this._prevPlayerIds;
        const currentPlayerIds = Object.keys(playersObj);
        if (prevPlayerIds.length > currentPlayerIds.length) {
            const leftUid = prevPlayerIds.find(uid => !currentPlayerIds.includes(uid));
            const me = this.auth.currentUser;
            if (leftUid && me && leftUid === me.uid) {
                this._prevPlayerIds = currentPlayerIds;
                this._prevPlayersObj = playersObj;
                return;
            }

            let leftName = 'Player';
            if (leftUid && this._prevPlayersObj && this._prevPlayersObj[leftUid] && this._prevPlayersObj[leftUid].username) {
                leftName = this._prevPlayersObj[leftUid].username;
            }
            this.game.showToast(`${leftName} left the room`, 'warning');

            const hostUid = roomData.host;
            const hostStillPresent = currentPlayerIds.includes(hostUid);
            if (roomData.gameStarted && currentPlayerIds.length === 1 && prevPlayerIds.length >= 2) {
                setTimeout(() => {
                    this.game.showToast('Other player left. Returning to game.', 'info');
                    this.leaveRoom();
                }, 1000);
                this._prevPlayerIds = currentPlayerIds;
                return;
            }
            if (!roomData.gameStarted && !hostStillPresent && me && me.uid !== hostUid) {
                setTimeout(() => {
                    this.game.showToast('Host left. Returning to menu.', 'info');
                    this.leaveRoom();
                }, 1000);
                this._prevPlayerIds = currentPlayerIds;
                return;
            }
        }
        this._prevPlayerIds = currentPlayerIds;
        this._prevPlayersObj = playersObj;

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

            const img = document.getElementById('multiplayerImage');
            const loadingOverlay = document.getElementById('multiplayerLoadingOverlay');
            
            if (roomData.currentPuzzle) {
                this.displayCurrentPuzzle(roomData.currentPuzzle);
            } else {
                // Reset to placeholder when no puzzle
                if (img) {
                    img.src = 'assets/images/monkey.png';
                    img.alt = 'Multiplayer Puzzle';
                }
                if (loadingOverlay) loadingOverlay.classList.add('hidden');
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

            if (playersArr.length < 2) {
                this.game.showToast('Need at least 2 players to start', 'error');
                return;
            }

            const readyCount = playersArr.filter(p => p.ready === true).length;
            const allReady = readyCount === playersArr.length;

            if (!allReady) {
                this.game.showToast('All players must be ready', 'error');
                return;
            }

            const puzzleData = await this.game.fetchBananaPuzzle();

            await roomRef.update({
                gameStarted: true,
                currentRound: 0,
                currentPuzzle: puzzleData,
                roundStartTime: firebase.database.ServerValue.TIMESTAMP
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
        const loadingOverlay = document.getElementById('multiplayerLoadingOverlay');
        
        if (!img || !puzzleData.imageUrl) return;

        // Show loading overlay
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');

        // Preload image
        const preImg = new window.Image();
        preImg.onload = () => {
            img.src = puzzleData.imageUrl;
            img.alt = 'Multiplayer banana puzzle';
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        };
        preImg.onerror = () => {
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
            this.game.showToast('⚠️ Puzzle image failed to load', 'warning');
        };
        preImg.src = puzzleData.imageUrl;
    }

    handleRoomDeleted() {
        this.game.showToast('Room was closed by host', 'warning');
        this.leaveRoom();
    }

    async leaveRoom() {
        const user = this.auth.currentUser;

        if (this.matchmakingQueueRef) {
            try { await this.matchmakingQueueRef.remove(); } catch { }
            this.matchmakingQueueRef = null;
        }
        if (this.queueListener && this.db && this.db.ref) {
            try { this.db.ref('matchmakingQueue').off('value', this.queueListener); } catch { }
            this.queueListener = null;
        }

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

        const statusEl = document.getElementById('multiplayerStatus');
        if (statusEl) statusEl.textContent = 'Create or join a room to start playing!';

        // Clear both chat sections
        const list = document.getElementById('mpChatList');
        if (list) list.innerHTML = '';
        const listLobby = document.getElementById('mpChatListLobby');
        if (listLobby) listLobby.innerHTML = '';
        const inp = document.getElementById('mpChatInput');
        if (inp) inp.value = '';
        const inpLobby = document.getElementById('mpChatInputLobby');
        if (inpLobby) inpLobby.innerHTML = '';

    }

    initChat(roomCode) {
        // Clean up any existing chat listeners first
        this.cleanupRoomListeners();
        this.chatListeners = [];

        // Initialize both chat sections (game and lobby)
        const listEl = document.getElementById('mpChatList');
        const listElLobby = document.getElementById('mpChatListLobby');
        const inputEl = document.getElementById('mpChatInput');
        const inputElLobby = document.getElementById('mpChatInputLobby');
        const sendBtn = document.getElementById('mpChatSendBtn');
        const sendBtnLobby = document.getElementById('mpChatSendBtnLobby');
        const emojiBtn = document.getElementById('mpEmojiBtn');
        const emojiBtnLobby = document.getElementById('mpEmojiBtnLobby');
        const emojiPicker = document.getElementById('mpEmojiPicker');
        const emojiPickerLobby = document.getElementById('mpEmojiPickerLobby');

        const gifBtn = document.getElementById('mpGifBtn');
        const gifBtnLobby = document.getElementById('mpGifBtnLobby');
        const gifPicker = document.getElementById('mpGifPicker');
        const gifPickerLobby = document.getElementById('mpGifPickerLobby');
        const gifSearchInput = document.getElementById('mpGifSearchInput');
        const gifSearchInputLobby = document.getElementById('mpGifSearchInputLobby');
        const gifSearchBtn = document.getElementById('mpGifSearchBtn');
        const gifSearchBtnLobby = document.getElementById('mpGifSearchBtnLobby');
        const gifResults = document.getElementById('mpGifResults');
        const gifResultsLobby = document.getElementById('mpGifResultsLobby');

        // At least one chat section must exist
        if ((!listEl && !listElLobby) || (!inputEl && !inputElLobby) || (!sendBtn && !sendBtnLobby)) return;

        if (listEl) listEl.innerHTML = '';
        if (listElLobby) listElLobby.innerHTML = '';

        this.chatRef = this.db.ref(`multiplayerRooms/${roomCode}/chat`).orderByChild('ts').limitToLast(50);

        const onAdd = this.chatRef.on('child_added', (snap) => {
            const msg = snap.val();
            if (!msg) return;
            this.renderChatMessage(msg);
        });

        this.chatListeners.push(() => this.chatRef && this.chatRef.off('child_added', onAdd));

        // Set up send buttons and input handlers for both chat sections
        if (sendBtn && inputEl) {
            sendBtn.onclick = () => this.sendChat(inputEl);
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChat(inputEl);
                }
            };
        }

        if (sendBtnLobby && inputElLobby) {
            sendBtnLobby.onclick = () => this.sendChat(inputElLobby);
            inputElLobby.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChat(inputElLobby);
                }
            };
        }

        // Helper function to initialize emoji/GIF pickers for a chat section
        const initChatPickers = (input, emojiBtn, emojiPicker, gifBtn, gifPicker, gifSearchInput, gifSearchBtn, gifResults) => {
            if (!emojiBtn || !emojiPicker || !input) return;

            emojiBtn.onclick = (ev) => {
                ev.stopPropagation();
                emojiPicker.classList.toggle('hidden');
            };

            if (gifBtn && gifPicker && gifSearchInput && gifSearchBtn && gifResults) {
                const loadRecommendedGifs = async () => {
                    gifResults.innerHTML = '<div class="col-span-3 text-center text-gray-400">Loading...</div>';
                    try {
                        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${MultiplayerManager.GIPHY_API_KEY}&q=funny&limit=12&rating=pg`);
                        const data = await res.json();
                        gifResults.innerHTML = '';
                        if (data.data && data.data.length) {
                            data.data.forEach(gif => {
                                const img = document.createElement('img');
                                img.src = gif.images.fixed_height_small.url;
                                img.alt = gif.title;
                                img.className = 'rounded cursor-pointer hover:scale-105 transition-transform';
                                img.style.width = '100%';
                                img.onclick = () => {
                                    this.insertAtCursor(input, `[GIF]${gif.images.original.url}[/GIF]`);
                                    gifPicker.classList.add('hidden');
                                    input.focus();
                                };
                                gifResults.appendChild(img);
                            });
                        } else {
                            gifResults.innerHTML = '<div class="col-span-3 text-center text-gray-400">No GIFs found.</div>';
                        }
                    } catch {
                        gifResults.innerHTML = '<div class="col-span-3 text-center text-red-400">Error loading GIFs.</div>';
                    }
                };

                gifBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    gifPicker.classList.toggle('hidden');
                    if (!gifPicker.classList.contains('hidden')) {
                        gifSearchInput.value = '';
                        gifSearchInput.focus();
                        loadRecommendedGifs();
                    }
                };

                gifSearchBtn.onclick = async () => {
                    const q = gifSearchInput.value.trim();
                    if (!q) return;
                    gifResults.innerHTML = '<div class="col-span-3 text-center text-gray-400">Searching...</div>';
                    try {
                        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${MultiplayerManager.GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=pg`);
                        const data = await res.json();
                        gifResults.innerHTML = '';
                        if (data.data && data.data.length) {
                            data.data.forEach(gif => {
                                const img = document.createElement('img');
                                img.src = gif.images.fixed_height_small.url;
                                img.alt = gif.title;
                                img.className = 'rounded cursor-pointer hover:scale-105 transition-transform';
                                img.style.width = '100%';
                                img.onclick = () => {
                                    this.insertAtCursor(input, `[GIF]${gif.images.original.url}[/GIF]`);
                                    gifPicker.classList.add('hidden');
                                    input.focus();
                                };
                                gifResults.appendChild(img);
                            });
                        } else {
                            gifResults.innerHTML = '<div class="col-span-3 text-center text-gray-400">No GIFs found.</div>';
                        }
                    } catch {
                        gifResults.innerHTML = '<div class="col-span-3 text-center text-red-400">Error loading GIFs.</div>';
                    }
                };

                gifSearchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') gifSearchBtn.click();
                });

                const gifOutsideHandler = (ev) => {
                    if (!gifPicker.contains(ev.target) && ev.target !== gifBtn) {
                        gifPicker.classList.add('hidden');
                    }
                };
                document.addEventListener('click', gifOutsideHandler);
                this.chatListeners.push(() => document.removeEventListener('click', gifOutsideHandler));
            }

            const emojiClickHandler = (ev) => {
                const btn = ev.target.closest && ev.target.closest('.mp-emoji');
                if (!btn) return;
                // Only handle if the button is within this specific picker
                if (!emojiPicker.contains(btn)) return;
                ev.preventDefault();
                ev.stopPropagation();
                const emoji = btn.dataset && btn.dataset.emoji ? btn.dataset.emoji : btn.textContent || '';
                if (emoji) {
                    this.insertAtCursor(input, emoji);
                    input.focus();
                }
                emojiPicker.classList.add('hidden');
            };
            emojiPicker.addEventListener('click', emojiClickHandler);
            this.chatListeners.push(() => emojiPicker.removeEventListener('click', emojiClickHandler));

            const outsideHandler = (ev) => {
                if (!emojiPicker.contains(ev.target) && ev.target !== emojiBtn) {
                    emojiPicker.classList.add('hidden');
                }
            };
            document.addEventListener('click', outsideHandler);
            this.chatListeners.push(() => document.removeEventListener('click', outsideHandler));
        };

        // Initialize pickers for game chat section
        initChatPickers(inputEl, emojiBtn, emojiPicker, gifBtn, gifPicker, gifSearchInput, gifSearchBtn, gifResults);

        // Initialize pickers for lobby chat section
        initChatPickers(inputElLobby, emojiBtnLobby, emojiPickerLobby, gifBtnLobby, gifPickerLobby, gifSearchInputLobby, gifSearchBtnLobby, gifResultsLobby);
    }

    sendChat(inputEl) {
        const user = this.auth.currentUser;
        if (!user || !this.currentRoom || !this.chatRef) return;


        let html = '';
        if (inputEl.isContentEditable) {
            html = inputEl.innerHTML.trim();
        } else {
            html = (inputEl.value || '').replace(/\s+/g, ' ').slice(0, 300).trim();
        }
        if (!html || !html.replace(/<[^>]*>/g, '').trim() && !/<img/i.test(html)) return;

        const username = this.game.usernameGlobal || user.displayName || (user.email || 'User').split('@')[0];

        const roomChatRoot = this.db.ref(`multiplayerRooms/${this.currentRoom}/chat`);

        let text = '';
        try {
            if (inputEl.isContentEditable) {
                text = (inputEl.textContent || '').trim().slice(0, 300);
                if (!text && /<img/i.test(html)) text = '[image]';
            } else {
                text = (inputEl.value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 300).trim();
                if (!text && /\[GIF\].+\[\/GIF\]/i.test(html)) text = '[GIF]';
            }
        } catch (e) {
            text = '';
        }

        roomChatRoot.push({
            uid: user.uid,
            username,
            html,
            text,
            ts: Date.now()
        }).catch(err => {
            console.error('chat send failed:', err);
            this.game.showToast('Message failed to send', 'error');
        });

        if (inputEl.isContentEditable) {
            inputEl.innerHTML = '';
        } else {
            inputEl.value = '';
        }
    }

    renderChatMessage(msg) {
        const listEl = document.getElementById('mpChatList');
        const listElLobby = document.getElementById('mpChatListLobby');
        
        // Render to both chat lists if they exist
        const lists = [listEl, listElLobby].filter(el => el !== null);
        if (lists.length === 0) return;

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
        if (msg.html) {
            const temp = document.createElement('div');
            let safe = msg.html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, tagName) => {
                    if (tagName === 'img') return tag;
                    return '';
                });
            temp.innerHTML = safe;
            const imgs = Array.from(temp.querySelectorAll('img'));
            imgs.forEach(img => {
                text.appendChild(img.cloneNode(true));
            });
            const textContent = temp.textContent.trim();
            if (textContent) {
                const textDiv = document.createElement('div');
                textDiv.textContent = textContent;
                textDiv.style.marginTop = imgs.length ? '0.5em' : '';
                text.appendChild(textDiv);
            }
        } else if (msg.text) {
            text.textContent = msg.text;
        }

        const time = document.createElement('div');
        time.className = 'mt-0.5 text-[10px] opacity-60';
        time.textContent = this.formatTime(msg.ts);

        if (!isMe) bubble.appendChild(name);
        bubble.appendChild(text);
        bubble.appendChild(time);
        row.appendChild(bubble);

        // Append to all chat lists
        lists.forEach(list => {
            const rowClone = row.cloneNode(true);
            list.appendChild(rowClone);
            list.scrollTop = list.scrollHeight;
        });

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

    insertAtCursor(inputEl, text) {
        if (inputEl.isContentEditable) {
            inputEl.focus();
            const sel = window.getSelection();
            if (!sel || !sel.getRangeAt || sel.rangeCount === 0) {
                inputEl.innerHTML += text;
                return;
            }
            const range = sel.getRangeAt(0);
            const gifMatch = text.match(/^\[GIF\](.+)\[\/GIF\]$/);
            if (gifMatch) {
                const img = document.createElement('img');
                img.src = gifMatch[1];
                img.alt = 'GIF';
                img.className = 'rounded max-h-40 inline';
                range.deleteContents();
                range.insertNode(img);
                range.setStartAfter(img);
                range.setEndAfter(img);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } else {
            try {
                const start = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : inputEl.value.length;
                const end = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : inputEl.value.length;
                const val = inputEl.value || '';
                inputEl.value = val.slice(0, start) + text + val.slice(end);
                const pos = start + text.length;
                inputEl.setSelectionRange(pos, pos);
            } catch (e) {
                try {
                    inputEl.value = (inputEl.value || '') + text;
                } catch { }
            }
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
        if (!roomData.players || !roomData.players[user.uid]) return;

        const currentPlayer = roomData.players[user.uid];
        if (currentPlayer) {
            const scoreEl = document.getElementById('multiplayerPlayerScore');
            if (scoreEl) scoreEl.textContent = currentPlayer.score || 0;
            const statusEl = document.getElementById('multiplayerPlayerStatus');
            if (statusEl) statusEl.textContent = currentPlayer.solved ? '✅ Solved!' : '⏳ Thinking...';
            const roundInfoEl = document.getElementById('multiplayerRoundInfo');
            if (roundInfoEl) roundInfoEl.textContent = `Round ${(roomData.currentRound || 0) + 1} of ${roomData.totalRounds || 3}`;
        }
        this.updateLiveScores(roomData);
    }

    startRoundTimer() {
        if (this.timerInterval) return;
        const total = 60;
        this.timerInterval = setInterval(async () => {
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
                const user = this.auth.currentUser;
                if (this.gameStarted && user && this.currentRoom) {
                    const roomRef = this.db.ref('multiplayerRooms/' + this.currentRoom);
                    const snapshot = await roomRef.once('value');
                    const roomData = snapshot.val();
                    if (roomData && roomData.host === user.uid && !roomData.gameCompleted) {
                        await this.nextRound(roomData);
                    }
                }
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