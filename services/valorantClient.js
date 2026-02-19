const axios = require('axios');

const API_BASE = 'https://api.henrikdev.xyz';

function getApiKey() {
	return process.env.VALORANT_API_KEY || null;
}

function createClient(apiKey) {
	return axios.create({
		baseURL: API_BASE,
		timeout: 15000,
		headers: {
			Accept: 'application/json',
			Authorization: apiKey,
		},
	});
}

async function getMmrHistory({ region, platform, name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v2/mmr-history/${region}/${platform}/${encodedName}/${encodedTag}`);
	return response.data;
}

async function getMmrHistoryV1({ region, name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v1/mmr-history/${region}/${encodedName}/${encodedTag}`);
	return response.data;
}

async function getMmrDetailsV3({ region, platform, name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v3/mmr/${region}/${platform}/${encodedName}/${encodedTag}`);
	return response.data;
}

async function getMmrDetailsV2({ region, name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v2/mmr/${region}/${encodedName}/${encodedTag}`);
	return response.data;
}

async function getMatchesV3({ region, name, tag, mode = 'competitive', size = 5, start = null }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const params = { mode, size };
	if (start !== null) params.start = start;
	const response = await client.get(`/valorant/v3/matches/${region}/${encodedName}/${encodedTag}`, {
		params,
	});
	return response.data;
}

async function getStoredMatches({ region, name, tag, mode = 'competitive', page = null, size = null }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const params = { mode };
	if (page !== null) params.page = page;
	if (size !== null) params.size = size;
	const response = await client.get(`/valorant/v1/stored-matches/${region}/${encodedName}/${encodedTag}`, {
		params,
	});
	return response.data;
}

async function getStoredMmrHistory({ region, platform, name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v2/stored-mmr-history/${region}/${platform}/${encodedName}/${encodedTag}`);
	return response.data;
}

async function getAccount({ name, tag }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new Error('VALORANT_API_KEY is missing.');
	}
	const client = createClient(apiKey);
	const encodedName = encodeURIComponent(name);
	const encodedTag = encodeURIComponent(tag);
	const response = await client.get(`/valorant/v1/account/${encodedName}/${encodedTag}`);
	return response.data;
}

module.exports = {
	getApiKey,
	getMmrHistory,
	getMmrHistoryV1,
	getMmrDetailsV3,
	getMmrDetailsV2,
	getMatchesV3,
	getStoredMatches,
	getStoredMmrHistory,
	getAccount,
};
