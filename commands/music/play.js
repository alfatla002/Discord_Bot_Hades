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
			const message = getPlaybackErrorMessage(error);
			await interaction.editReply(message);
		}
	},
};

function getPlaybackErrorMessage(error) {
	const details = (error?.message ?? '').toLowerCase();
	if (details.includes('sign in') || details.includes('confirm you’re not a bot') || details.includes("confirm you're not a bot")) {
		return 'YouTube is blocking playback. Add a cookies file via `YOUTUBE_COOKIES_PATH` and try again.';
	}
	if (details.includes('video is unavailable') || details.includes('private') || details.includes('copyright')) {
		return 'That video is unavailable for playback. Try another track or a different link.';
	}
	if (details.includes('yt-dlp failed')) {
		return 'Unable to fetch audio from YouTube right now. Try again or provide a different link.';
	}
	return 'Unable to play that track right now.';
}
