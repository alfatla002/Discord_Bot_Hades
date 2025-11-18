const { SlashCommandBuilder } = require('discord.js');
const music = require('../../services/musicPlayer');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('skip')
		.setDescription('Skip the currently playing track'),
	async execute(interaction) {
		const voiceChannel = interaction.member?.voice?.channel;
		if (!voiceChannel) {
			return interaction.reply({ content: 'Join the voice channel to control playback.', ephemeral: true });
		}

		const queue = music.getQueue(interaction.guildId);
		if (!queue || !queue.current) {
			return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
		}

		if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
			return interaction.reply({ content: 'You must be in the same voice channel as the bot to skip.', ephemeral: true });
		}

		try {
			const skipped = music.skip(interaction.guildId);
			await interaction.reply(`⏭️ Skipped **${skipped.title}**.`);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'Unable to skip right now.', ephemeral: true });
		}
	},
};
