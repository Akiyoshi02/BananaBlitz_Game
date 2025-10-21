class FriendsManager {
    constructor(game) {
        this.game = game;
        this.db = game.db;
    }

    async findUserByUsername(username) {
        if (!username) return null;
        const key = username.toLowerCase();
        const snap = await this.db.ref(`usernames/${key}`).once('value');
        const row = snap.val();
        if (!row || !row.uid) return null;
        return { uid: row.uid, email: row.email || '', username };
    }

    async sendInvite(toUid, toUsername) {
        const me = this.game.auth.currentUser;
        if (!me || !toUid || me.uid === toUid) return;
        const rawName = this.game.usernameGlobal || me.displayName || (me.email ? me.email.split('@')[0] : 'Player');
        let myName = String(rawName).replace(/[^\x20-\x7E]/g, '').trim();
        if (!myName) myName = 'Player';

        await this.db
            .ref(`friends/${toUid}/friendInvites/${me.uid}`)
            .set({ username: myName, timestamp: Date.now() });

        this.game.showToast(`Invite sent to ${toUsername || 'player'} ✅`, 'success');
    }

    async acceptInvite(inviterUid) {
        const me = this.game.auth.currentUser;
        if (!me || !inviterUid) return;

        const updates = {};
        updates[`friends/${me.uid}/friends/${inviterUid}`] = true;
        updates[`friends/${inviterUid}/friends/${me.uid}`] = true;
        updates[`friends/${me.uid}/friendInvites/${inviterUid}`] = null;
        await this.db.ref().update(updates);

        this.game.showToast('Friend added ✅', 'success');
    }

    async declineInvite(inviterUid) {
        const me = this.game.auth.currentUser;
        if (!me || !inviterUid) return;
        await this.db.ref(`friends/${me.uid}/friendInvites/${inviterUid}`).remove();
        this.game.showToast('Invite declined', 'info');
    }

    async removeFriend(friendUid) {
        const me = this.game.auth.currentUser;
        if (!me || !friendUid) return;
        const updates = {};
        updates[`friends/${me.uid}/friends/${friendUid}`] = null;
        updates[`friends/${friendUid}/friends/${me.uid}`] = null;
        await this.db.ref().update(updates);
        this.game.showToast('Removed from friends', 'warning');
    }

    async listMyFriends() {
        const me = this.game.auth.currentUser;
        if (!me) return [];
        const snap = await this.db.ref(`friends/${me.uid}/friends`).once('value');
        const map = snap.val() || {};
        return Object.keys(map).filter(uid => map[uid] === true);
    }

    async listMyInvites() {
        const me = this.game.auth.currentUser;
        if (!me) return [];
        const snap = await this.db.ref(`friends/${me.uid}/friendInvites`).once('value');
        const map = snap.val() || {};
        return Object.entries(map).map(([inviterUid, v]) => ({ inviterUid, ...(v || {}) }));
    }
}

window.FriendsManager = FriendsManager;
