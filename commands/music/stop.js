const { SlashCommandBuilder } = require('discord.js');
const music = require('../../services/musicPlayer');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stop')
		.setDescription('Stop playback and clear the queue'),
	async execute(interaction) {
		const voiceChannel = interaction.member?.voice?.channel;
		if (!voiceChannel) {
			return interaction.reply({ content: 'Join the voice channel to control playback.', ephemeral: true });
		}

		const queue = music.getQueue(interaction.guildId);
		if (!queue) {
			return interaction.reply({ content: 'There is nothing to stop.', ephemeral: true });
		}

		if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
			return interaction.reply({ content: 'You must be in the same voice channel as the bot to stop it.', ephemeral: true });
		}

		try {
			music.stop(interaction.guildId);
			await interaction.reply('⏹️ Cleared the queue and left the voice channel.');
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'Unable to stop playback.', ephemeral: true });
		}
	},
};
