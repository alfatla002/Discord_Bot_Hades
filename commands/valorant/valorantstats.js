const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
} = require('discord.js');
const {
	getApiKey,
	getMmrHistory,
	getMmrHistoryV1,
	getStoredMmrHistory,
	getMmrDetailsV3,
	getMmrDetailsV2,
	getMatchesV3,
	getAccount,
} = require('../../services/valorantClient');
const { getMapImage } = require('../../services/valorantAssets');
const { getLinkedRiotId } = require('../../services/valorantLinks');

const REGION = 'na';
const PLATFORM = 'pc';
const DEFAULT_HOURS = 12;

function getEntryTimestamp(entry) {
	if (!entry) return null;
	const raw = entry.date_raw ?? entry.dateRaw ?? entry.timestamp;
	if (raw !== undefined && raw !== null) {
		if (typeof raw === 'string') {
			const numeric = Number(raw);
			if (!Number.isNaN(numeric)) {
				return numeric > 1e12 ? numeric : numeric * 1000;
			}
			const parsed = Date.parse(raw);
			if (!Number.isNaN(parsed)) return parsed;
		} else {
			const numeric = Number(raw);
			if (!Number.isNaN(numeric)) {
				return numeric > 1e12 ? numeric : numeric * 1000;
			}
		}
	}

	const dateString = entry.date ?? entry.date_time ?? entry.created_at ?? entry.started_at;
	if (dateString) {
		const parsed = Date.parse(dateString);
		if (!Number.isNaN(parsed)) return parsed;
	}

	return null;
}

function formatDelta(value) {
	if (value > 0) return `+${value}`;
	if (value < 0) return `${value}`;
	return '0';
}

function getRrDelta(entry) {
	if (!entry || typeof entry !== 'object') return 0;
	const storedChange = Number(entry.last_change);
	if (!Number.isNaN(storedChange) && entry.last_change !== undefined) {
		return storedChange;
	}
	const direct = Number(entry.mmr_change_to_last_game);
	if (!Number.isNaN(direct) && entry.mmr_change_to_last_game !== undefined) {
		return direct;
	}

	const rrAfter = Number(entry.ranking_in_tier_after ?? entry.ranking_in_tier);
	const rrBefore = Number(entry.ranking_in_tier_before ?? entry.previous_ranking_in_tier);
	if (!Number.isNaN(rrAfter) && !Number.isNaN(rrBefore)) {
		return rrAfter - rrBefore;
	}

	const eloAfter = Number(entry.elo_after ?? entry.elo);
	const eloBefore = Number(entry.elo_before ?? entry.previous_elo);
	if (!Number.isNaN(eloAfter) && !Number.isNaN(eloBefore)) {
		return eloAfter - eloBefore;
	}

	return 0;
}

function buildSummaryEmbed({
	playerLabel,
	windowLabel,
	windowStartUnix,
	firstMatchUnix,
	lastMatchUnix,
	games,
	gained,
	lost,
	net,
	currentTier,
	currentRr,
	currentElo,
	peakTier,
	windowEmpty,
	cardImage,
	rankIcon,
	accountLevel,
	winRate,
	winRateLabel,
	currentStreakLabel,
	longestWinStreak,
	currentLoseStreak,
}) {
	const embed = new EmbedBuilder()
		.setTitle(`Valorant Stats — ${playerLabel}`)
		.setColor(0xf44e5b)
		.setDescription('Region: NA • Platform: PC');

	if (rankIcon) {
		embed.setAuthor({ name: 'Current Rank', iconURL: rankIcon });
	}

	if (cardImage) {
		embed.setThumbnail(cardImage);
	} else if (rankIcon) {
		embed.setThumbnail(rankIcon);
	}

	embed.addFields(
		{ name: 'Window', value: `${windowLabel} (since <t:${windowStartUnix}:f>)`, inline: false },
		{ name: 'Games', value: `${games}`, inline: true },
		{ name: 'RR Gained', value: `${gained}`, inline: true },
		{ name: 'RR Lost', value: `${lost}`, inline: true },
		{ name: 'Net', value: `${net}`, inline: true },
	);

	if (firstMatchUnix) {
		embed.addFields({ name: 'First match in window', value: `<t:${firstMatchUnix}:f>`, inline: false });
	}

	if (windowEmpty && lastMatchUnix) {
		embed.addFields({ name: 'Most recent match', value: `<t:${lastMatchUnix}:f>`, inline: false });
	}

	if (currentTier) {
		embed.addFields({ name: 'Current Tier', value: currentTier, inline: true });
	}

	embed.addFields({ name: 'Peak Rank', value: peakTier || 'Unknown', inline: true });

	if (accountLevel !== null && accountLevel !== undefined) {
		embed.addFields({ name: 'Account Level', value: `${accountLevel}`, inline: true });
	}

	if (currentRr !== null && currentRr !== undefined) {
		embed.addFields({ name: 'Current RR', value: `${currentRr}`, inline: true });
	}

	if (currentElo !== null && currentElo !== undefined) {
		embed.addFields({ name: 'Current Elo', value: `${currentElo}`, inline: true });
	}

	if (winRate !== null && winRate !== undefined) {
		embed.addFields({ name: `Win Rate (${winRateLabel})`, value: `${winRate}%`, inline: true });
	}

	if (currentStreakLabel) {
		embed.addFields({ name: 'Current Streak', value: currentStreakLabel, inline: true });
	}

	if (longestWinStreak !== null && longestWinStreak !== undefined) {
		embed.addFields({ name: 'Longest Win Streak (recent)', value: `${longestWinStreak}`, inline: true });
	}

	if (currentLoseStreak !== null && currentLoseStreak !== undefined) {
		embed.addFields({ name: 'Current Loss Streak', value: `${currentLoseStreak}`, inline: true });
	}

	return embed;
}

function buildButtonRow(disabled = false) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('valorantstats_prev')
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId('valorantstats_next')
			.setLabel('Next')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled),
	);
}

function extractMmrDetails(mmrResponse) {
	if (!mmrResponse) return {};
	const payload = mmrResponse.data ?? mmrResponse;
	const currentData = payload.current_data ?? payload.current ?? payload.current_mmr ?? payload.currentData ?? {};
	const tierName = currentData.currenttier_patched
		?? currentData.tier_name
		?? currentData.tier?.name
		?? currentData.tier
		?? payload.currenttier_patched
		?? payload.tier?.name
		?? null;
	const peakTier = payload.peak?.tier?.name
		?? payload.highest_rank?.patched_tier
		?? payload.peak_rank?.patched_tier
		?? payload.highest_rank?.patched_tier?.name
		?? payload.peak_rank?.patched_tier?.name
		?? payload.highest_rank?.tier?.name
		?? payload.peak_rank?.tier?.name
		?? null;
	const rr = currentData.ranking_in_tier
		?? currentData.rr
		?? currentData.tier_progress
		?? payload.ranking_in_tier
		?? null;
	const elo = currentData.elo ?? payload.elo ?? null;
	return { tierName, rr, elo, peakTier };
}

function buildMatchesEmbed({
	playerLabel,
	playerName,
	playerTag,
	match,
	cardImage,
	rankIcon,
	pageIndex,
	pageTotal,
}) {
	const embed = new EmbedBuilder()
		.setTitle(`Match Details — ${playerLabel} (${pageIndex + 1}/${pageTotal})`)
		.setColor(0x22c55e)
		.setDescription('Latest competitive matches with detailed stats.');

	if (cardImage) {
		embed.setThumbnail(cardImage);
	} else if (rankIcon) {
		embed.setThumbnail(rankIcon);
	}

	if (!match) {
		embed.addFields({ name: 'Match', value: 'No match data found.' });
		return embed;
	}

	const meta = match.metadata ?? {};
	const mapName = meta.map ?? meta.map_name ?? 'Unknown map';
	const mapId = meta.map_id ?? meta.map?.id ?? null;
	const mode = meta.mode ?? meta.queue ?? 'Competitive';
	const started = meta.started_at ?? meta.game_start_patched ?? meta.started_at_unix ?? null;
	let startedMs = null;
	if (typeof started === 'number') {
		startedMs = started > 1e12 ? started : started * 1000;
	} else if (started) {
		const parsed = Date.parse(started);
		startedMs = Number.isNaN(parsed) ? null : parsed;
	}
	const timeLabel = startedMs ? `<t:${Math.floor(startedMs / 1000)}:R>` : 'Unknown time';

	const teams = match.teams ?? {};
	const red = teams.red ?? teams.blue ?? {};
	const blue = teams.blue ?? teams.red ?? {};
	const scoreRed = red.rounds_won ?? red.score ?? null;
	const scoreBlue = blue.rounds_won ?? blue.score ?? null;
	const score = (scoreRed !== null && scoreBlue !== null) ? `${scoreRed}-${scoreBlue}` : 'Score N/A';

	const allPlayers = match.players?.all_players ?? [];
	const player = allPlayers.find(p => {
		const name = p.name ?? p.game_name ?? p.gameName ?? '';
		const tag = p.tag ?? p.tag_line ?? p.tagLine ?? '';
		return name.toLowerCase() === playerName.toLowerCase()
			&& tag.toLowerCase() === playerTag.toLowerCase();
	});

	const stats = player?.stats ?? {};
	const k = stats.kills ?? null;
	const d = stats.deaths ?? null;
	const a = stats.assists ?? null;
	const kda = (k !== null && d !== null && a !== null) ? `${k}/${d}/${a}` : null;
	const headshots = stats.headshots ?? null;
	const bodyshots = stats.bodyshots ?? null;
	const legshots = stats.legshots ?? null;
	const shots = (headshots ?? 0) + (bodyshots ?? 0) + (legshots ?? 0);
	const hsPct = shots > 0 ? Math.round((headshots / shots) * 100) : null;
	const agent = player?.character ?? player?.agent ?? null;
	const team = (player?.team ?? '').toLowerCase();
	const redId = (red.team_id ?? 'red').toLowerCase();
	const blueId = (blue.team_id ?? 'blue').toLowerCase();
	const won = team
		? (team === redId || team === 'red' ? red.has_won : team === blueId || team === 'blue' ? blue.has_won : null)
		: null;
	const result = won === true ? 'Win' : won === false ? 'Loss' : null;
	const duration = meta.game_length
		?? meta.game_length_in_ms
		?? meta.game_length_in_seconds
		?? meta.length
		?? null;
	let durationMs = null;
	if (typeof duration === 'number') {
		if (duration > 1e12) {
			durationMs = duration;
		} else if (duration > 100000) {
			durationMs = duration;
		} else if (duration > 1000) {
			durationMs = duration * 1000;
		} else if (duration > 0) {
			durationMs = duration * 1000;
		}
	}
	const durationMin = durationMs ? Math.round(durationMs / 60000) : null;

	const mapImage = getMapImage(mapName, mapId);
	if (mapImage) {
		embed.setImage(mapImage);
	}

	if (agent && player?.assets?.agent?.small) {
		embed.setAuthor({ name: `Agent Played: ${agent}`, iconURL: player.assets.agent.small });
	}

	embed.addFields(
		{ name: 'When', value: timeLabel, inline: true },
		{ name: 'Score', value: score, inline: true },
		{ name: 'Mode', value: mode, inline: true },
		{ name: 'Result', value: result ?? 'Unknown', inline: true },
		{ name: 'KDA', value: kda ?? 'Unknown', inline: true },
		{ name: 'HS%', value: hsPct !== null ? `${hsPct}%` : 'Unknown', inline: true },
		{ name: 'Duration', value: durationMin ? `${durationMin}m` : 'Unknown', inline: true },
		{ name: 'Map', value: mapName, inline: false },
	);
	return embed;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('valorantstats')
		.setDescription('Show Valorant MMR summary and recent match history.')
		.addStringOption(option =>
			option
				.setName('riotid')
				.setDescription('Riot ID name (without tag)')
				.setRequired(false),
			)
			.addStringOption(option =>
				option
					.setName('tag')
					.setDescription('Riot tag (e.g. NA1)')
					.setRequired(false),
			)
			.addIntegerOption(option =>
				option
					.setName('hours')
					.setDescription('Hours to look back (default 12)')
					.setMinValue(1),
			),
	async execute(interaction) {
		const hours = interaction.options.getInteger('hours') ?? DEFAULT_HOURS;
		const riotId = interaction.options.getString('riotid');
		const tag = interaction.options.getString('tag');
		const linked = getLinkedRiotId(interaction.user.id);

		const name = riotId?.trim() || linked?.name || null;
		const riotTag = tag?.trim() || linked?.tag || null;

		if (!name || !riotTag) {
			await interaction.reply({
				content: 'Provide `riotid` + `tag`, or link your account with `/valorantlink` first.',
				ephemeral: true,
			});
			return;
		}

		if (!getApiKey()) {
			await interaction.reply({
				content: 'VALORANT_API_KEY is not set on the bot. Please add it to the environment and restart.',
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply();

		try {
			let currentTier = null;
			let currentRr = null;
			let currentElo = null;
			let peakTier = null;
			let rankIcon = null;
			let cardImage = null;
			let accountLevel = null;
			try {
				const account = await getAccount({ name, tag: riotTag });
				const card = account?.data?.card;
				if (card && typeof card === 'object') {
					cardImage = card.small ?? card.wide ?? card.large ?? null;
				}
				accountLevel = account?.data?.account_level ?? null;
			} catch (error) {
				// Best-effort; don't block stats on account lookup errors.
			}

			try {
				const mmrDetails = await getMmrDetailsV3({
					region: REGION,
					platform: PLATFORM,
					name,
					tag: riotTag,
				});
				const extracted = extractMmrDetails(mmrDetails);
				currentTier = extracted.tierName ?? null;
				currentRr = extracted.rr ?? null;
				currentElo = extracted.elo ?? null;
				peakTier = extracted.peakTier ?? null;
			} catch (error) {
				// Best-effort; don't block stats on MMR detail errors.
			}

			try {
				const mmrDetailsV2 = await getMmrDetailsV2({
					region: REGION,
					name,
					tag: riotTag,
				});
				const payload = mmrDetailsV2.data ?? mmrDetailsV2;
				const currentData = payload.current_data ?? payload.current ?? {};
				rankIcon = currentData.images?.small
					?? currentData.images?.large
					?? payload.images?.small
					?? payload.images?.large
					?? null;
				if (!peakTier) {
					peakTier = payload.highest_rank?.patched_tier
						?? payload.highest_rank?.tier?.name
						?? null;
				}
				if (!currentTier) {
					currentTier = currentData.currenttier_patched
						?? currentData.tier?.name
						?? payload.currenttier_patched
						?? null;
				}
			} catch (error) {
				// Best-effort; don't block stats on v2 errors.
			}

			const response = await getMmrHistory({
				region: REGION,
				platform: PLATFORM,
				name,
				tag: riotTag,
			});

			let history = Array.isArray(response?.data) ? response.data : [];

			if (history.length === 0) {
				const storedResponse = await getStoredMmrHistory({
					region: REGION,
					platform: PLATFORM,
					name,
					tag: riotTag,
				});
				const storedHistory = Array.isArray(storedResponse?.data) ? storedResponse.data : [];
				if (storedHistory.length > 0) {
					history = storedHistory;
				}
			}
			const now = Date.now();
			const localNow = new Date();
			const startOfDay = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()).getTime();
			const cutoff = now - hours * 60 * 60 * 1000;

			let timestamps = history.map(entry => getEntryTimestamp(entry)).filter(Boolean);
			let windowEntries = history.filter(entry => {
				const ts = getEntryTimestamp(entry);
				return ts && ts >= cutoff;
			});

			if (history.length === 0 || windowEntries.length === 0) {
				try {
					const v1Response = await getMmrHistoryV1({ region: REGION, name, tag: riotTag });
					const v1History = Array.isArray(v1Response?.data) ? v1Response.data : [];
					if (v1History.length > 0) {
						history = v1History;
						timestamps = history.map(entry => getEntryTimestamp(entry)).filter(Boolean);
						windowEntries = history.filter(entry => {
							const ts = getEntryTimestamp(entry);
							return ts && ts >= cutoff;
						});
					}
				} catch (error) {
					// Best-effort; keep existing history if v1 fails.
				}
			}

	let gained = 0;
	let lost = 0;
	for (const entry of windowEntries) {
		const change = getRrDelta(entry);
		if (change > 0) gained += change;
		if (change < 0) lost += Math.abs(change);
	}

			const net = gained - lost;
			const games = windowEntries.length;
			const firstMatchTs = windowEntries
				.map(entry => getEntryTimestamp(entry))
				.filter(Boolean)
				.sort((a, b) => a - b)[0];
			const firstMatchUnix = firstMatchTs ? Math.floor(firstMatchTs / 1000) : null;
		const windowStartUnix = Math.floor((firstMatchTs ?? cutoff) / 1000);
		const windowLabel = `Last ${hours} hours`;
			const lastMatchTs = timestamps.sort((a, b) => b - a)[0];
			const lastMatchUnix = lastMatchTs ? Math.floor(lastMatchTs / 1000) : null;
			if (!currentTier) {
				currentTier = history[0]?.currenttier_patched
					?? history[0]?.tier?.name
					?? history[0]?.tier
					?? null;
			}
			const playerLabel = `${name}#${riotTag}`;

			let matches = [];
			try {
				const matchResponse = await getMatchesV3({
					region: REGION,
					name,
					tag: riotTag,
					mode: 'competitive',
					size: 9,
				});
				matches = Array.isArray(matchResponse?.data) ? matchResponse.data : [];
			} catch (error) {
				matches = [];
			}

			const winStats = matches.reduce(
				(acc, match) => {
					const teams = match.teams ?? {};
					const red = teams.red ?? teams.blue ?? {};
					const blue = teams.blue ?? teams.red ?? {};
					const allPlayers = match.players?.all_players ?? [];
					const player = allPlayers.find(p => {
						const pName = p.name ?? p.game_name ?? p.gameName ?? '';
						const pTag = p.tag ?? p.tag_line ?? p.tagLine ?? '';
						return pName.toLowerCase() === name.toLowerCase()
							&& pTag.toLowerCase() === riotTag.toLowerCase();
					});
					const team = (player?.team ?? '').toLowerCase();
					const redId = (red.team_id ?? 'red').toLowerCase();
					const blueId = (blue.team_id ?? 'blue').toLowerCase();
					const won = team
						? (team === redId || team === 'red' ? red.has_won : team === blueId || team === 'blue' ? blue.has_won : null)
						: null;
					if (won === true) acc.wins += 1;
					if (won === false) acc.losses += 1;
					if (won !== null) acc.count += 1;
					return acc;
				},
				{ wins: 0, losses: 0, count: 0 },
			);
			const winRate = winStats.count ? Math.round((winStats.wins / winStats.count) * 100) : null;
			const winRateLabel = winStats.count ? `last ${winStats.count}` : 'recent';

			const outcomes = matches.map(match => {
				const teams = match.teams ?? {};
				const red = teams.red ?? teams.blue ?? {};
				const blue = teams.blue ?? teams.red ?? {};
				const allPlayers = match.players?.all_players ?? [];
				const player = allPlayers.find(p => {
					const pName = p.name ?? p.game_name ?? p.gameName ?? '';
					const pTag = p.tag ?? p.tag_line ?? p.tagLine ?? '';
					return pName.toLowerCase() === name.toLowerCase()
						&& pTag.toLowerCase() === riotTag.toLowerCase();
				});
				const team = (player?.team ?? '').toLowerCase();
				const redId = (red.team_id ?? 'red').toLowerCase();
				const blueId = (blue.team_id ?? 'blue').toLowerCase();
				const won = team
					? (team === redId || team === 'red' ? red.has_won : team === blueId || team === 'blue' ? blue.has_won : null)
					: null;
				if (won === true) return 'W';
				if (won === false) return 'L';
				return null;
			}).filter(Boolean);

			let currentStreakLabel = null;
			let currentLoseStreak = null;
			if (outcomes.length) {
				const first = outcomes[0];
				let count = 0;
				for (const result of outcomes) {
					if (result !== first) break;
					count += 1;
				}
				currentStreakLabel = `${first}-${count}`;
				if (first === 'L') {
					currentLoseStreak = `L-${count}`;
				}
			}

			let longestWinStreak = 0;
			let streak = 0;
			for (const result of outcomes) {
				if (result === 'W') {
					streak += 1;
					longestWinStreak = Math.max(longestWinStreak, streak);
				} else {
					streak = 0;
				}
			}
			if (longestWinStreak === 0) longestWinStreak = null;


			const summaryEmbed = buildSummaryEmbed({
				playerLabel,
				windowLabel,
				windowStartUnix,
				firstMatchUnix,
				lastMatchUnix,
				games,
				gained,
				lost,
				net,
				currentTier,
				currentRr,
				currentElo,
				peakTier,
				windowEmpty: windowEntries.length === 0,
				cardImage,
				rankIcon,
				accountLevel,
				winRate,
				winRateLabel,
				currentStreakLabel,
				longestWinStreak,
				currentLoseStreak,
			});

			const matchPages = [];
			const maxMatchPages = 3;
			const totalPages = Math.min(maxMatchPages, matches.length || 0) || 1;
			for (let i = 0; i < totalPages; i += 1) {
				const match = matches[i] ?? null;
				matchPages.push(
					buildMatchesEmbed({
						playerLabel,
						playerName: name,
						playerTag: riotTag,
						match,
						cardImage,
						rankIcon,
						pageIndex: i,
						pageTotal: totalPages,
					}),
				);
			}

			const pages = [summaryEmbed, ...matchPages];
			let pageIndex = 0;

			const message = await interaction.editReply({
				embeds: [pages[pageIndex]],
				components: [buildButtonRow(pages.length === 1)],
				fetchReply: true,
			});

			if (pages.length === 1) return;

			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 120000,
			});

			collector.on('collect', async buttonInteraction => {
				if (buttonInteraction.user.id !== interaction.user.id) {
					await buttonInteraction.reply({
						content: 'Only the command author can use these buttons.',
						ephemeral: true,
					});
					return;
				}

				if (buttonInteraction.customId === 'valorantstats_prev') {
					pageIndex = (pageIndex - 1 + pages.length) % pages.length;
				}

				if (buttonInteraction.customId === 'valorantstats_next') {
					pageIndex = (pageIndex + 1) % pages.length;
				}

				await buttonInteraction.update({
					embeds: [pages[pageIndex]],
					components: [buildButtonRow(false)],
				});
			});

			collector.on('end', async () => {
				await interaction.editReply({
					components: [buildButtonRow(true)],
				});
			});
		} catch (error) {
			const message = error?.response?.data?.message
				|| error?.response?.data?.errors?.[0]?.message
				|| error.message
				|| 'Unknown error.';

			await interaction.editReply({
				content: `Valorant API error: ${message}`,
			});
		}
	},
};
