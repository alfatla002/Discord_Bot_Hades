const rawMapAssets = require('../valorant_map_assets.json');

const mapAssets = Object.entries(rawMapAssets).reduce((acc, [key, value]) => {
	acc[key.toLowerCase()] = value;
	return acc;
}, {});

function getMapImage(mapName, mapId) {
	if (mapId) {
		return `https://media.valorant-api.com/maps/${mapId}/listviewicon.png`;
	}
	if (!mapName) return null;
	const normalized = mapName.trim().toLowerCase();
	return mapAssets[normalized] ?? null;
}

module.exports = {
	getMapImage,
};
