const { SlashCommandBuilder } = require('discord.js');
const { setLinkedRiotId } = require('../../services/valorantLinks');

function normalize(value) {
	return value?.trim();
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('valorantlink')
		.setDescription('Link your Riot ID to your Discord account.')
		.addStringOption(option =>
			option
				.setName('riotid')
				.setDescription('Riot ID name (without tag)')
				.setRequired(true),
		)
		.addStringOption(option =>
			option
				.setName('tag')
				.setDescription('Riot tag (e.g. NA1)')
				.setRequired(true),
		),
	async execute(interaction) {
		const riotId = normalize(interaction.options.getString('riotid', true));
		const tag = normalize(interaction.options.getString('tag', true));

		if (!riotId || !tag) {
			await interaction.reply({
				content: 'Please provide both a Riot ID and tag.',
				ephemeral: true,
			});
			return;
		}

		setLinkedRiotId(interaction.user.id, { name: riotId, tag });

		await interaction.reply({
			content: `Linked ${riotId}#${tag} to your Discord account.`,
			ephemeral: true,
		});
	},
};
