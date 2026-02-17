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
	getMatchesV3,
	getMmrDetailsV3,
	getMmrDetailsV2,
	getAccount,
	getStoredMatches,
} = require('../../services/valorantClient');
const { getLinkedRiotId } = require('../../services/valorantLinks');

const REGION = 'na';
const PLATFORM = 'pc';
const MAX_MATCHES = 200;
const PAGE_SIZE = 50;

function formatRatio(numerator, denominator) {
	if (!denominator) return 'N/A';
	return (numerator / denominator).toFixed(2);
}

function formatPercent(value) {
	if (value === null || value === undefined) return 'N/A';
	return `${value}%`;
}

function buildButtonRow(disabled = false) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('valorantstats_alltime_prev')
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId('valorantstats_alltime_next')
			.setLabel('Next')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled),
	);
}

function toLower(value) {
	return (value || '').toString().trim().toLowerCase();
}

function getMatchStartMs(match) {
	const meta = match.metadata ?? {};
	const started = meta.game_start ?? meta.game_start_patched ?? meta.started_at ?? meta.started_at_unix ?? null;
	if (typeof started === 'number') return started > 1e12 ? started : started * 1000;
	if (started) {
		const parsed = Date.parse(started);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function getPlayer(match, name, tag, puuid) {
	const allPlayers = match.players?.all_players ?? [];
	if (puuid) {
		const byPuuid = allPlayers.find(p => p.puuid === puuid);
		if (byPuuid) return byPuuid;
	}
	const n = toLower(name);
	const t = toLower(tag);
	const exact = allPlayers.find(p => toLower(p.name ?? p.game_name ?? p.gameName) === n
		&& toLower(p.tag ?? p.tag_line ?? p.tagLine) === t);
	if (exact) return exact;
	const nameOnly = allPlayers.find(p => toLower(p.name ?? p.game_name ?? p.gameName) === n);
	return nameOnly || null;
}

function getMatchResult(match, player) {
	const teams = match.teams ?? {};
	const team = toLower(player?.team ?? '');
	let won = null;
	if (team) {
		const direct = teams[team];
		if (direct && typeof direct === 'object') {
			won = direct.has_won ?? null;
		}
	}
	if (won === null) {
		const red = teams.red ?? {};
		const blue = teams.blue ?? {};
		const redId = toLower(red.team_id ?? 'red');
		const blueId = toLower(blue.team_id ?? 'blue');
		if (team === redId || team === 'red') won = red.has_won ?? null;
		if (team === blueId || team === 'blue') won = blue.has_won ?? null;
	}
	if (won === null && teams && typeof teams === 'object') {
		for (const value of Object.values(teams)) {
			const teamId = toLower(value?.team_id ?? '');
			if (teamId && teamId === team) {
				won = value?.has_won ?? null;
				break;
			}
		}
	}
	return won === true ? 'W' : won === false ? 'L' : null;
}

function getScore(match) {
	const teams = match.teams ?? {};
	const red = teams.red ?? teams.blue ?? {};
	const blue = teams.blue ?? teams.red ?? {};
	const scoreRed = red.rounds_won ?? red.score ?? null;
	const scoreBlue = blue.rounds_won ?? blue.score ?? null;
	return (scoreRed !== null && scoreBlue !== null) ? `${scoreRed}-${scoreBlue}` : 'N/A';
}

async function fetchAllStoredMatches({ name, tag }) {
	const matches = [];
	let page = 1;
	while (matches.length < MAX_MATCHES) {
		const response = await getStoredMatches({
			region: REGION,
			name,
			tag,
			mode: 'competitive',
			page,
			size: PAGE_SIZE,
		});
		const pageData = Array.isArray(response?.data) ? response.data : [];
		if (!pageData.length) break;
		matches.push(...pageData);
		if (pageData.length < PAGE_SIZE) break;
		page += 1;
	}
	return matches.slice(0, MAX_MATCHES);
}

function storedPayloadIsMinimal(match) {
	if (!match) return true;
	const hasPlayers = Array.isArray(match.players?.all_players) && match.players.all_players.length > 0;
	const hasMetadata = match.metadata && Object.keys(match.metadata).length > 0;
	return !hasPlayers && !hasMetadata;
}

async function fetchAllMatchesFallback({ name, tag }) {
	const matches = [];
	let start = 0;
	const pageSize = 10;
	while (matches.length < MAX_MATCHES) {
		const response = await getMatchesV3({
			region: REGION,
			name,
			tag,
			mode: 'competitive',
			size: pageSize,
			start,
		});
		const pageData = Array.isArray(response?.data) ? response.data : [];
		if (!pageData.length) break;
		matches.push(...pageData);
		if (pageData.length < pageSize) break;
		start += pageSize;
	}
	return matches.slice(0, MAX_MATCHES);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('valorantallstats')
		.setDescription('Show detailed all-time Valorant stats (based on recent matches).')
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
		),
	async execute(interaction) {
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
			let cardImage = null;
			let accountLevel = null;
			let currentTier = null;
			let rankIcon = null;
			let peakTier = null;
			let accountPuuid = null;
			try {
				const account = await getAccount({ name, tag: riotTag });
				const card = account?.data?.card;
				if (card && typeof card === 'object') {
					cardImage = card.small ?? card.wide ?? card.large ?? null;
				}
				accountLevel = account?.data?.account_level ?? null;
				accountPuuid = account?.data?.puuid ?? null;
			} catch (error) {
				// best-effort
			}

			try {
				const mmrDetails = await getMmrDetailsV3({ region: REGION, platform: PLATFORM, name, tag: riotTag });
				const payload = mmrDetails.data ?? mmrDetails;
				const currentData = payload.current_data ?? payload.current ?? {};
				currentTier = currentData.currenttier_patched
					?? currentData.tier?.name
					?? payload.currenttier_patched
					?? null;
				peakTier = payload.peak?.tier?.name
					?? payload.highest_rank?.patched_tier
					?? payload.highest_rank?.tier?.name
					?? null;
			} catch (error) {
				// best-effort
			}

			try {
				const mmrDetailsV2 = await getMmrDetailsV2({ region: REGION, name, tag: riotTag });
				const payload = mmrDetailsV2.data ?? mmrDetailsV2;
				const currentData = payload.current_data ?? payload.current ?? {};
				rankIcon = currentData.images?.small
					?? currentData.images?.large
					?? payload.images?.small
					?? payload.images?.large
					?? null;
				if (!currentTier) {
					currentTier = currentData.currenttier_patched
						?? currentData.tier?.name
						?? payload.currenttier_patched
						?? null;
				}
				if (!peakTier) {
					peakTier = payload.highest_rank?.patched_tier
						?? payload.highest_rank?.tier?.name
						?? null;
				}
			} catch (error) {
				// best-effort
			}

			let matches = await fetchAllStoredMatches({ name, tag: riotTag });
			if (!matches.length || storedPayloadIsMinimal(matches[0])) {
				matches = await fetchAllMatchesFallback({ name, tag: riotTag });
			}
			const playerLabel = `${name}#${riotTag}`;

			if (!matches.length) {
				await interaction.editReply({ content: 'No competitive matches found for this player.' });
				return;
			}

			const withTs = matches.map((match, idx) => ({ match, ts: getMatchStartMs(match), idx }));
			const validTs = withTs.filter(item => item.ts).length;
			let sortedMatches = [];
			if (validTs / withTs.length < 0.5) {
				sortedMatches = [...matches].reverse();
			} else {
				sortedMatches = withTs
					.sort((a, b) => {
						if (a.ts && b.ts) return a.ts - b.ts;
						if (a.ts) return -1;
						if (b.ts) return 1;
						return a.idx - b.idx;
					})
					.map(item => item.match);
			}

			let wins = 0;
			let losses = 0;
			let damageMadeTotal = 0;
			let damageReceivedTotal = 0;
			let hs = 0;
			let shots = 0;
			let durationMsTotal = 0;
			let killsTotal = 0;
			let deathsTotal = 0;
			let assistsTotal = 0;
			let roundsTotal = 0;
			let seenDamage = false;
			const agentCounts = new Map();
			const agentStats = new Map();
			const mapStats = new Map();
			const teammateCounts = new Map();
			const outcomesWithTs = [];

			for (const match of sortedMatches) {
				const player = getPlayer(match, name, riotTag, accountPuuid);
				if (!player) continue;
				const result = getMatchResult(match, player);
				if (result === 'W') wins += 1;
				if (result === 'L') losses += 1;
				if (result) {
					const ts = getMatchStartMs(match);
					if (ts) outcomesWithTs.push({ result, ts });
				}

				const stats = player.stats ?? player.stats?.overview ?? player.stats?.overall ?? {};
				const kills = Number(stats.kills ?? 0);
				const deaths = Number(stats.deaths ?? 0);
				const assists = Number(stats.assists ?? 0);
				killsTotal += kills;
				deathsTotal += deaths;
				assistsTotal += assists;
				const headshots = Number(stats.headshots ?? 0);
				const bodyshots = Number(stats.bodyshots ?? 0);
				const legshots = Number(stats.legshots ?? 0);
				hs += headshots;
				shots += headshots + bodyshots + legshots;
				const dmgMade = Number(player.damage_made ?? 0);
				const dmgReceived = Number(player.damage_received ?? 0);
				if (!Number.isNaN(dmgMade) || !Number.isNaN(dmgReceived)) {
					seenDamage = true;
					damageMadeTotal += dmgMade;
					damageReceivedTotal += dmgReceived;
				}

				const agent = player.character ?? player.agent ?? 'Unknown';
				agentCounts.set(agent, (agentCounts.get(agent) ?? 0) + 1);
				const agentEntry = agentStats.get(agent) ?? { kills: 0, deaths: 0, games: 0 };
				agentEntry.kills += kills;
				agentEntry.deaths += deaths;
				agentEntry.games += 1;
				agentStats.set(agent, agentEntry);

				const meta = match.metadata ?? {};
				const mapName = meta.map ?? meta.map_name ?? 'Unknown map';
				const mapEntry = mapStats.get(mapName) ?? { wins: 0, losses: 0, games: 0 };
				mapEntry.games += 1;
				if (result === 'W') mapEntry.wins += 1;
				if (result === 'L') mapEntry.losses += 1;
				mapStats.set(mapName, mapEntry);

				const duration = meta.game_length ?? meta.game_length_in_ms ?? meta.game_length_in_seconds ?? null;
				if (typeof duration === 'number') {
					const durationMs = duration > 1e12 ? duration
						: duration > 100000 ? duration
						: duration > 1000 ? duration * 1000
						: duration * 1000;
					durationMsTotal += durationMs;
				}

				const scoreLabel = getScore(match);
				if (scoreLabel !== 'N/A') {
					const parts = scoreLabel.split('-').map(Number);
					if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
						roundsTotal += parts[0] + parts[1];
					}
				} else {
					const meta = match.metadata ?? {};
					const rounds = Number(meta.rounds_played ?? meta.rounds ?? 0);
					if (!Number.isNaN(rounds) && rounds > 0) {
						roundsTotal += rounds;
					}
				}

				const allPlayers = match.players?.all_players ?? [];
				const team = toLower(player.team ?? '');
				for (const teammate of allPlayers) {
					if (toLower(teammate.team ?? '') !== team) continue;
					if (accountPuuid && teammate.puuid === accountPuuid) continue;
					const mateName = teammate.name ?? teammate.game_name ?? teammate.gameName ?? '';
					const mateTag = teammate.tag ?? teammate.tag_line ?? teammate.tagLine ?? '';
					if (toLower(mateName) === toLower(name) && toLower(mateTag) === toLower(riotTag)) continue;
					const key = `${mateName}#${mateTag}`;
					teammateCounts.set(key, (teammateCounts.get(key) ?? 0) + 1);
				}
			}

			const totalGames = wins + losses;
			const winRate = totalGames ? Math.round((wins / totalGames) * 100) : 0;
			const hsPct = shots ? Math.round((hs / shots) * 100) : 0;
			const kdRatio = formatRatio(killsTotal, deathsTotal);
			const kadRatio = formatRatio(killsTotal + assistsTotal, deathsTotal);
			const killsPerRound = roundsTotal ? (killsTotal / roundsTotal).toFixed(2) : 'N/A';
			const damageMadePerRound = seenDamage && roundsTotal ? Math.round(damageMadeTotal / roundsTotal) : null;
			const damageTakenPerRound = seenDamage && roundsTotal ? Math.round(damageReceivedTotal / roundsTotal) : null;
			const hoursPlayed = durationMsTotal ? (durationMsTotal / 3600000).toFixed(1) : '0.0';

			const mostPlayedAgent = Array.from(agentCounts.entries())
				.sort((a, b) => b[1] - a[1])[0];

			const mapList = Array.from(mapStats.entries()).map(([map, stats]) => ({
				map,
				games: stats.games,
				winRate: stats.games ? Math.round((stats.wins / stats.games) * 100) : 0,
			}));
			const bestMap = mapList.sort((a, b) => b.winRate - a.winRate)[0];

			const topTeammates = Array.from(teammateCounts.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);

			const pages = [];

			const overview = new EmbedBuilder()
				.setTitle(`Valorant All-Time — ${playerLabel}`)
				.setColor(0xf44e5b)
				.setDescription(`Based on the most recent ${matches.length} competitive matches available via the API.`)
				.addFields(
					{ name: 'Total Matches', value: `${matches.length}`, inline: true },
					{ name: 'Win Rate', value: formatPercent(winRate), inline: true },
					{ name: 'Hours Played', value: `${hoursPlayed}h`, inline: true },
					{ name: 'HS%', value: formatPercent(hsPct), inline: true },
					{ name: 'K/D', value: kdRatio, inline: true },
					{ name: 'KAD', value: kadRatio, inline: true },
					{ name: 'Kills/Round', value: `${killsPerRound}`, inline: true },
					{ name: 'Current Tier', value: currentTier ?? 'Unknown', inline: true },
					{ name: 'Peak Rank', value: peakTier ?? 'Unknown', inline: true },
					{ name: 'Account Level', value: accountLevel !== null && accountLevel !== undefined ? `${accountLevel}` : 'Unknown', inline: true },
				);
			if (damageMadePerRound !== null) {
				overview.addFields({ name: 'Dmg Made/Round', value: `${damageMadePerRound}`, inline: true });
			}
			if (damageTakenPerRound !== null) {
				overview.addFields({ name: 'Dmg Taken/Round', value: `${damageTakenPerRound}`, inline: true });
			}

			if (rankIcon) {
				overview.setAuthor({ name: 'Current Rank', iconURL: rankIcon });
			}
			if (cardImage) {
				overview.setThumbnail(cardImage);
			}
			pages.push(overview);

			const agentPage = new EmbedBuilder()
				.setTitle(`Agents & Maps — ${playerLabel}`)
				.setColor(0x4f79ff)
				.addFields(
					{ name: 'Most Played Agent', value: mostPlayedAgent ? `${mostPlayedAgent[0]} (${mostPlayedAgent[1]} games)` : 'Unknown', inline: false },
				);
			const topAgents = Array.from(agentCounts.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([agent, count], index) => {
					const stats = agentStats.get(agent) ?? { kills: 0, deaths: 0 };
					const kd = formatRatio(stats.kills, stats.deaths);
					return `${index + 1}. ${agent} — ${count} games • K/D ${kd}`;
				})
				.join('\n');
			if (topAgents) {
				agentPage.addFields({ name: 'Top Agents', value: topAgents, inline: false });
			}
			if (bestMap) {
				agentPage.addFields({ name: 'Best Map', value: `${bestMap.map} (${bestMap.winRate}% WR over ${bestMap.games} games)`, inline: false });
			}
			pages.push(agentPage);

			const mapPage = new EmbedBuilder()
				.setTitle(`Map Performance — ${playerLabel}`)
				.setColor(0x22c55e);
			const topMaps = mapList
				.sort((a, b) => b.games - a.games)
				.slice(0, 5)
				.map((map, index) => `${index + 1}. ${map.map} — ${map.winRate}% WR (${map.games} games)`)
				.join('\n');
			if (topMaps) {
				mapPage.addFields({ name: 'Top 5', value: topMaps, inline: false });
			}
			pages.push(mapPage);

			const squadPage = new EmbedBuilder()
				.setTitle(`Squad & Match Info — ${playerLabel}`)
				.setColor(0xf59e0b)
				.addFields(
					{ name: 'Wins / Losses', value: `${wins}W / ${losses}L`, inline: true },
					{ name: 'Latest Match Score', value: getScore(matches[0] ?? {}), inline: true },
					{ name: 'Most Played With', value: topTeammates.length ? topTeammates.map(([nameTag, count]) => `${nameTag} (${count})`).join('\n') : 'No data', inline: false },
				);
			pages.push(squadPage);

			const paged = pages.slice(0, 4);
			let pageIndex = 0;
			const message = await interaction.editReply({
				embeds: [paged[pageIndex]],
				components: [buildButtonRow(paged.length === 1)],
				fetchReply: true,
			});

			if (paged.length === 1) return;

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

				if (buttonInteraction.customId === 'valorantstats_alltime_prev') {
					pageIndex = (pageIndex - 1 + paged.length) % paged.length;
				}

				if (buttonInteraction.customId === 'valorantstats_alltime_next') {
					pageIndex = (pageIndex + 1) % paged.length;
				}

				await buttonInteraction.update({
					embeds: [paged[pageIndex]],
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
