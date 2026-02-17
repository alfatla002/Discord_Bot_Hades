const { SlashCommandBuilder } = require('discord.js');
const { removeLinkedRiotId } = require('../../services/valorantLinks');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('valorantunlink')
		.setDescription('Remove your linked Riot ID.'),
	async execute(interaction) {
		const removed = removeLinkedRiotId(interaction.user.id);
		if (!removed) {
			await interaction.reply({
				content: 'No linked Riot ID was found for your account.',
				ephemeral: true,
			});
			return;
		}

		await interaction.reply({
			content: 'Your linked Riot ID has been removed.',
			ephemeral: true,
		});
	},
};
