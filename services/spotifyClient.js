const axios = require('axios');

let tokenCache = { accessToken: null, expiresAt: 0 };

function isSpotifyTrackUrl(url) {
	if (!url) return false;
	return /open\.spotify\.com\/track\//.test(url) || /^spotify:track:/i.test(url);
}

function extractSpotifyTrackId(input) {
	if (!input) return null;
	const matchUrl = input.match(/track\/([a-zA-Z0-9]+)(?:\?|$)/);
	if (matchUrl) return matchUrl[1];
	const matchUri = input.match(/spotify:track:([a-zA-Z0-9]+)/i);
	if (matchUri) return matchUri[1];
	return null;
}

async function getSpotifyTrackInfo(input) {
	const id = extractSpotifyTrackId(input);
	if (!id) return null;
	const token = await getAccessToken();
	if (!token) return null;
	const response = await axios.get(`https://api.spotify.com/v1/tracks/${id}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const track = response.data;
	return {
		name: track.name,
		artist: track.artists?.map(artist => artist.name).join(' ') ?? '',
	};
}

async function getAccessToken() {
	const id = process.env.SPOTIFY_CLIENT_ID;
	const secret = process.env.SPOTIFY_CLIENT_SECRET;
	if (!id || !secret) {
		console.warn('Spotify credentials missing; skipping Spotify lookups.');
		return null;
	}

	if (tokenCache.accessToken && tokenCache.expiresAt > Date.now()) {
		return tokenCache.accessToken;
	}

	const credentials = Buffer.from(`${id}:${secret}`).toString('base64');
	const params = new URLSearchParams({ grant_type: 'client_credentials' });
	const response = await axios.post('https://accounts.spotify.com/api/token', params, {
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});

	tokenCache = {
		accessToken: response.data.access_token,
		expiresAt: Date.now() + (response.data.expires_in - 30) * 1000,
	};

	return tokenCache.accessToken;
}

module.exports = {
	isSpotifyTrackUrl,
	getSpotifyTrackInfo,
};
