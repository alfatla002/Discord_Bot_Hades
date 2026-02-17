const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getApiKey, getMmrHistory, getStoredMmrHistory, getAccount } = require('../../services/valorantClient');
const { getLinkedRiotId } = require('../../services/valorantLinks');

const REGION = 'na';
const PLATFORM = 'pc';

function getEntryTimestamp(entry) {
	if (!entry) return null;
	const raw = entry.date_raw ?? entry.dateRaw ?? entry.timestamp;
	if (raw !== undefined && raw !== null) {
		const numeric = Number(raw);
		if (!Number.isNaN(numeric)) {
			return numeric > 1e12 ? numeric : numeric * 1000;
		}
	}

	const dateString = entry.date ?? entry.date_time ?? entry.created_at ?? entry.started_at;
	if (dateString) {
		const parsed = Date.parse(dateString);
		if (!Number.isNaN(parsed)) return parsed;
	}

	return null;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('valorantverify')
		.setDescription('Verify Valorant account + MMR history availability.')
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

		await interaction.deferReply({ ephemeral: true });

		const embed = new EmbedBuilder()
			.setTitle(`Valorant Verify — ${name}#${riotTag}`)
			.setColor(0x2ecc71)
			.setDescription('Region: NA • Platform: PC');

		try {
			const account = await getAccount({ name, tag: riotTag });
			const puuid = account?.data?.puuid ? 'Resolved' : 'Not found';
			embed.addFields({ name: 'Account Lookup', value: puuid, inline: true });
		} catch (error) {
			embed.addFields({
				name: 'Account Lookup',
				value: `Error: ${error?.response?.status || 'unknown'}`,
				inline: true,
			});
		}

		try {
			const response = await getMmrHistory({ region: REGION, platform: PLATFORM, name, tag: riotTag });
			const history = Array.isArray(response?.data) ? response.data : [];
			const lastTs = history
				.map(entry => getEntryTimestamp(entry))
				.filter(Boolean)
				.sort((a, b) => b - a)[0];
			const lastMatch = lastTs ? `<t:${Math.floor(lastTs / 1000)}:f>` : 'None';
			embed.addFields(
				{ name: 'Live MMR History', value: `${history.length} matches`, inline: true },
				{ name: 'Latest Live Match', value: lastMatch, inline: true },
			);
		} catch (error) {
			embed.addFields({
				name: 'Live MMR History',
				value: `Error: ${error?.response?.status || 'unknown'}`,
				inline: true,
			});
		}

		try {
			const response = await getStoredMmrHistory({ region: REGION, platform: PLATFORM, name, tag: riotTag });
			const history = Array.isArray(response?.data) ? response.data : [];
			const lastTs = history
				.map(entry => getEntryTimestamp(entry))
				.filter(Boolean)
				.sort((a, b) => b - a)[0];
			const lastMatch = lastTs ? `<t:${Math.floor(lastTs / 1000)}:f>` : 'None';
			embed.addFields(
				{ name: 'Stored MMR History', value: `${history.length} matches`, inline: true },
				{ name: 'Latest Stored Match', value: lastMatch, inline: true },
			);
		} catch (error) {
			embed.addFields({
				name: 'Stored MMR History',
				value: `Error: ${error?.response?.status || 'unknown'}`,
				inline: true,
			});
		}

		await interaction.editReply({ embeds: [embed] });
	},
};
