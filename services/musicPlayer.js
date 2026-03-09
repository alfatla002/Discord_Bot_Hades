require('dotenv').config();
require('opusscript');
const {
	AudioPlayerStatus,
	NoSubscriberBehavior,
	createAudioPlayer,
	createAudioResource,
	demuxProbe,
	joinVoiceChannel,
	entersState,
	VoiceConnectionStatus,
} = require('@discordjs/voice');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const ytSearch = require('yt-search');
const { isSpotifyTrackUrl, getSpotifyTrackInfo } = require('./spotifyClient');

const TARGET_VOLUME = 0.02; // 2% volume
const YTDLP_BASE_ARGS = [
	'--no-check-certificates',
	'--no-warnings',
	'--prefer-free-formats',
	'--no-playlist',
	'--extractor-args',
	'youtube:player_client=ios,android,web',
];
const YTDLP_STREAM_ARGS = [
	'-o',
	'-',
	'-q',
	'-f',
	'bestaudio[ext=m4a]/bestaudio/best',
	'--default-search',
	'auto',
];
if (ffmpeg) {
	process.env.FFMPEG_PATH = ffmpeg;
}

const queues = new Map();
const searchCache = new Map();
const MAX_CACHE_ENTRIES = 50;

function getOrCreateQueue(guildId) {
	let queue = queues.get(guildId);
	if (queue) {
		return queue;
	}

	const player = createAudioPlayer({
		behaviors: {
			noSubscriber: NoSubscriberBehavior.Pause,
		},
	});

	queue = {
		guildId,
		player,
		connection: null,
		current: null,
		songs: [],
		voiceChannelId: null,
	};

	player.on(AudioPlayerStatus.Idle, () => {
		if (queue.current) {
			console.log('Player went idle for:', queue.current.title ?? queue.current.url);
		}
		queue.current = null;
		if (queue.songs.length) {
			playNext(guildId).catch(error => {
				console.error('Failed to continue queue:', error);
			});
		} else {
			cleanupQueue(guildId);
		}
	});

	player.on('error', error => {
		console.error('Audio player error:', error);
		queue.current = null;
		if (queue.songs.length) {
			playNext(guildId).catch(err => console.error('Failed to recover after error:', err));
		}
	});
	player.on('stateChange', (oldState, newState) => {
		console.log('Player state change:', oldState.status, '->', newState.status);
	});

	queues.set(guildId, queue);
	return queue;
}

function cleanupQueue(guildId) {
	const queue = queues.get(guildId);
	if (!queue) return;

	try {
		queue.player?.stop(true);
	} catch (error) {
		console.error('Error stopping player during cleanup:', error);
	}

	if (queue.connection) {
		try {
			if (queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
				queue.connection.destroy();
			}
		} catch (error) {
			console.error('Failed to destroy voice connection:', error);
		}
		queue.connection = null;
	}

	queues.delete(guildId);
}

async function enqueue(interaction, query) {
	const voiceChannel = interaction.member?.voice?.channel;
	if (!voiceChannel) {
		throw new Error('Join a voice channel first.');
	}

	const queue = getOrCreateQueue(interaction.guildId);
	queue.voiceChannelId = voiceChannel.id;

	if (!queue.connection) {
		queue.connection = joinVoiceChannel({
			channelId: voiceChannel.id,
			guildId: interaction.guildId,
			adapterCreator: interaction.guild.voiceAdapterCreator,
			selfDeaf: false,
		});

		queue.connection.on('stateChange', (oldState, newState) => {
			console.log('Voice state change:', oldState.status, '->', newState.status);
		});
		queue.connection.on(VoiceConnectionStatus.Disconnected, () => cleanupQueue(interaction.guildId));
		queue.connection.on(VoiceConnectionStatus.Destroyed, () => cleanupQueue(interaction.guildId));
		queue.connection.on('error', error => console.error('Voice connection error:', error));
		queue.connection.subscribe(queue.player);
	} else if (queue.connection.joinConfig.channelId !== voiceChannel.id) {
		queue.connection.destroy();
		queue.connection = joinVoiceChannel({
			channelId: voiceChannel.id,
			guildId: interaction.guildId,
			adapterCreator: interaction.guild.voiceAdapterCreator,
			selfDeaf: false,
		});
		queue.connection.on('stateChange', (oldState, newState) => {
			console.log('Voice state change:', oldState.status, '->', newState.status);
		});
		queue.connection.on(VoiceConnectionStatus.Disconnected, () => cleanupQueue(interaction.guildId));
		queue.connection.on(VoiceConnectionStatus.Destroyed, () => cleanupQueue(interaction.guildId));
		queue.connection.on('error', error => console.error('Voice connection error:', error));
		queue.connection.subscribe(queue.player);
	}

	try {
		await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000);
	} catch (error) {
		console.error('Voice connection failed to become ready:', error);
		cleanupQueue(interaction.guildId);
		throw new Error('Failed to connect to the voice channel. Please try again.');
	}

	const song = await resolveSong(query, interaction.user);
	queue.songs.push(song);
	const position = queue.current ? queue.songs.length : 0;

	if (!queue.current) {
		await playNext(interaction.guildId);
	}

	return { song, position };
}

async function playNext(guildId) {
	const queue = queues.get(guildId);
	if (!queue) return;

	if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
		cleanupQueue(guildId);
		return;
	}

	const nextSong = queue.songs.shift();
	if (!nextSong) {
		queue.current = null;
		return;
	}

	try {
		const resource = await createStreamResource(nextSong.url);
		resource.volume?.setVolume(TARGET_VOLUME);
		queue.current = nextSong;
		queue.player.play(resource);
	} catch (error) {
		console.error('Unable to start playback:', error);
		if (Array.isArray(nextSong.fallbacks) && nextSong.fallbacks.length) {
			const fallback = nextSong.fallbacks.shift();
			queue.songs.unshift({ ...fallback, fallbacks: nextSong.fallbacks });
			await playNext(guildId);
			return;
		}
		queue.current = null;
		if (queue.songs.length) {
			await playNext(guildId);
		} else {
			cleanupQueue(guildId);
		}
	}
}

function skip(guildId) {
	const queue = queues.get(guildId);
	if (!queue || !queue.current) {
		throw new Error('Nothing is currently playing.');
	}

	queue.player.stop();
	return queue.current;
}

function stop(guildId) {
	const queue = queues.get(guildId);
	if (!queue) {
		throw new Error('There is no active queue.');
	}

	queue.songs = [];
	queue.current = null;
	queue.player.stop();
	cleanupQueue(guildId);
}

function getQueue(guildId) {
	const queue = queues.get(guildId);
	if (!queue) return null;

	return {
		current: queue.current,
		songs: [...queue.songs],
		voiceChannelId: queue.voiceChannelId,
	};
}

async function resolveSong(query, user) {
	const cacheKey = (query ?? '').trim().toLowerCase();
	if (cacheKey && searchCache.has(cacheKey)) {
		return { ...searchCache.get(cacheKey) };
	}

	if (isSpotifyTrackUrl(query)) {
		const spotifyTrack = await getSpotifyTrackInfo(query);
		if (spotifyTrack) {
			const searchTerm = `${spotifyTrack.name} ${spotifyTrack.artist}`.trim();
			const song = await findPlayableVideo(searchTerm, user);
			cacheSong(cacheKey, song);
			return song;
		}
	}

	if (isYouTubeUrl(query)) {
		const info = await getVideoInfo(query, user);
		if (info) {
			cacheSong(cacheKey, info);
			return info;
		}
		console.warn('Direct video lookup failed, falling back to search.');
	}

	const song = await findPlayableVideo(query, user);
	cacheSong(cacheKey, song);
	return song;
}

async function getVideoInfo(url, user) {
	try {
		const info = await fetchYtInfo(url);
		return {
			title: info.title,
			url: info.webpage_url ?? url,
			duration: info.duration ? formatDuration(Number(info.duration)) : 'Unknown',
			requestedBy: user?.tag ?? 'Unknown',
		};
	} catch (error) {
		console.error('Failed to resolve video info:', error.message ?? error);
		return null;
	}
}

async function findPlayableVideo(searchTerm, user) {
	let videos = [];
	try {
		const result = await ytSearch(searchTerm);
		videos = result?.videos?.slice(0, 5) ?? [];
	} catch (error) {
		console.error('YouTube search failed:', error);
		throw new Error('Unable to search for that query right now.');
	}

	const candidates = videos
		.map(video => {
			const normalizedUrl = normalizeYouTubeUrl(video.url);
			if (!normalizedUrl) return null;
			return {
				title: video.title,
				url: normalizedUrl,
				duration: video.timestamp ?? (video.duration ? formatDuration(Number(video.duration.seconds ?? video.duration)) : 'Unknown'),
				requestedBy: user?.tag ?? 'Unknown',
			};
		})
		.filter(Boolean);

	if (candidates.length) {
		const [primary, ...fallbacks] = candidates;
		primary.fallbacks = fallbacks;
		return primary;
	}

	throw new Error('Unable to find a playable version of that query.');
}

function normalizeYouTubeUrl(urlString) {
	if (!urlString) {
		return null;
	}

	try {
		const parsed = new URL(urlString);
		if (parsed.hostname.includes('youtu.be')) {
			const videoId = parsed.pathname.replace('/', '');
			return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
		}

		if (parsed.hostname.includes('youtube.com')) {
			if (parsed.searchParams.has('v')) {
				return `https://www.youtube.com/watch?v=${parsed.searchParams.get('v')}`;
			}

			const segments = parsed.pathname.split('/').filter(Boolean);
			if (segments[0] === 'shorts' && segments[1]) {
				return `https://www.youtube.com/watch?v=${segments[1]}`;
			}
		}

		return parsed.toString();
	} catch (error) {
		console.error('Failed to normalize YouTube URL:', error);
		return null;
	}
}

function isYouTubeUrl(value) {
	if (!value) return false;
	try {
		const url = new URL(value);
		return url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be');
	} catch {
		return false;
	}
}

function formatDuration(totalSeconds) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60)
		.toString()
		.padStart(2, '0');
	return `${minutes}:${seconds}`;
}

function buildYtDlpHeaders() {
	if (!process.env.YOUTUBE_COOKIE) {
		return [];
	}

	return [`Cookie: ${process.env.YOUTUBE_COOKIE}`];
}

function buildYtDlpCookieArgs() {
	if (!process.env.YOUTUBE_COOKIES_PATH) {
		return [];
	}
	return ['--cookies', process.env.YOUTUBE_COOKIES_PATH];
}

async function createStreamResource(url) {
	const normalizedUrl = normalizeYouTubeUrl(url);
	if (!normalizedUrl) {
		throw new Error(`Unable to normalize URL for playback: ${url}`);
	}

	const args = buildYtDlpArgs([...YTDLP_STREAM_ARGS, ...buildYtDlpCookieArgs(), normalizedUrl]);
	const downloader = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
	let stderr = '';
	downloader.stderr?.on('data', chunk => {
		stderr += chunk.toString();
	});

	if (!downloader.stdout) {
		downloader.kill('SIGTERM');
		throw new Error('yt-dlp did not provide a readable stream.');
	}

	downloader.once('error', error => console.error('yt-dlp process error:', error));
	downloader.once('close', code => {
		if (code !== 0) {
			console.error('yt-dlp exited with code', code, stderr.trim());
		} else if (stderr.trim()) {
			console.warn('yt-dlp warnings:', stderr.trim());
		}
	});

	let probe;
	try {
		probe = await demuxProbe(downloader.stdout);
	} catch (error) {
		if (!downloader.killed) {
			downloader.kill('SIGTERM');
		}
		const details = stderr.trim();
		throw new Error(details ? `yt-dlp failed: ${details}` : error.message);
	}
	const resource = createAudioResource(probe.stream, { inputType: probe.type, inlineVolume: true });

	resource.playStream.once('close', () => {
		if (!downloader.killed) {
			downloader.kill('SIGTERM');
		}
	});

	return resource;
}

function cacheSong(cacheKey, song) {
	if (!cacheKey) return;
	if (searchCache.has(cacheKey)) {
		searchCache.delete(cacheKey);
	}
	searchCache.set(cacheKey, { ...song });
	if (searchCache.size > MAX_CACHE_ENTRIES) {
		const firstKey = searchCache.keys().next().value;
		if (firstKey) {
			searchCache.delete(firstKey);
		}
	}
}

async function fetchYtInfo(input) {
	const args = buildYtDlpArgs(['--dump-single-json', ...buildYtDlpCookieArgs(), input]);
	const process = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
	let stdout = '';
	let stderr = '';

	process.stdout.on('data', chunk => {
		stdout += chunk.toString();
	});

	process.stderr.on('data', chunk => {
		stderr += chunk.toString();
	});

	const [code] = await once(process, 'close');
	if (code !== 0) {
		throw new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
	}

	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error('Failed to parse yt-dlp response.');
	}
}

function buildYtDlpArgs(additionalArgs = []) {
	const args = [...YTDLP_BASE_ARGS, ...additionalArgs];
	const headers = buildYtDlpHeaders();
	for (const header of headers) {
		args.push('--add-header', header);
	}
	return args;
}

module.exports = {
	enqueue,
	skip,
	stop,
	getQueue,
};
