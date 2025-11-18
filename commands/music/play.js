const { SlashCommandBuilder } = require('discord.js');
const music = require('../../services/musicPlayer');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Play a song from YouTube or search YouTube by name')
		.addStringOption(option =>
			option
				.setName('query')
				.setDescription('Song name or URL')
				.setRequired(true)),
	async execute(interaction) {
		const voiceChannel = interaction.member?.voice?.channel;
		if (!voiceChannel) {
			return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
		}

		const query = interaction.options.getString('query', true);
		await interaction.deferReply();

		try {
			const { song, position } = await music.enqueue(interaction, query);
			const message =
				position === 0
					? `▶️ Now playing **${song.title}** (${song.duration}).`
					: `➕ Added **${song.title}** to the queue (position ${position + 1}).`;
			await interaction.editReply(message);
		} catch (error) {
			console.error(error);
			await interaction.editReply('Unable to play that track right now.');
		}
	},
};
