const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'valorant-links.json');

function ensureStore() {
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	if (!fs.existsSync(dataFile)) {
		fs.writeFileSync(dataFile, JSON.stringify({}), 'utf8');
	}
}

function loadLinks() {
	ensureStore();
	try {
		const raw = fs.readFileSync(dataFile, 'utf8');
		return JSON.parse(raw || '{}');
	} catch (error) {
		console.warn('Failed to read valorant link store; starting fresh.', error);
		return {};
	}
}

function saveLinks(links) {
	ensureStore();
	fs.writeFileSync(dataFile, JSON.stringify(links, null, 2), 'utf8');
}

function getLinkedRiotId(discordUserId) {
	const links = loadLinks();
	return links[discordUserId] ?? null;
}

function setLinkedRiotId(discordUserId, riotId) {
	const links = loadLinks();
	links[discordUserId] = riotId;
	saveLinks(links);
}

function removeLinkedRiotId(discordUserId) {
	const links = loadLinks();
	if (links[discordUserId]) {
		delete links[discordUserId];
		saveLinks(links);
		return true;
	}
	return false;
}

module.exports = {
	getLinkedRiotId,
	setLinkedRiotId,
	removeLinkedRiotId,
};
