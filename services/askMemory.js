const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'hades.db');
const DEFAULT_LIMIT = 12;

let dbPromise = null;

async function getDb() {
	if (!dbPromise) {
		const dataDir = path.dirname(DB_PATH);
		fs.mkdirSync(dataDir, { recursive: true });
		dbPromise = open({ filename: DB_PATH, driver: sqlite3.Database });
		const db = await dbPromise;
		await db.exec('PRAGMA journal_mode = WAL;');
		await db.exec(`
			CREATE TABLE IF NOT EXISTS ask_messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				scope TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
		`);
		await db.exec('CREATE INDEX IF NOT EXISTS idx_ask_messages_scope ON ask_messages(scope, created_at);');
	}

	return dbPromise;
}

function buildScope({ guildId, channelId, userId }) {
	const guildPart = guildId || 'DM';
	return `${guildPart}:${channelId}:${userId}`;
}

async function getAskHistory({ guildId, channelId, userId, limit = DEFAULT_LIMIT }) {
	const db = await getDb();
	const scope = buildScope({ guildId, channelId, userId });
	const rows = await db.all(
		'SELECT role, content FROM ask_messages WHERE scope = ? ORDER BY created_at DESC LIMIT ?;',
		scope,
		limit,
	);
	return rows.reverse();
}

async function addAskMessage({ guildId, channelId, userId, role, content, limit = DEFAULT_LIMIT }) {
	const db = await getDb();
	const scope = buildScope({ guildId, channelId, userId });
	await db.run(
		'INSERT INTO ask_messages (scope, role, content) VALUES (?, ?, ?);',
		scope,
		role,
		content,
	);
	await db.run(
		`DELETE FROM ask_messages
		 WHERE scope = ?
		   AND id NOT IN (
			SELECT id FROM ask_messages WHERE scope = ? ORDER BY created_at DESC LIMIT ?
		   );`,
		scope,
		scope,
		limit,
	);
}

module.exports = {
	getAskHistory,
	addAskMessage,
};
