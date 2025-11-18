const { SlashCommandBuilder } = require('discord.js');
const music = require('../../services/musicPlayer');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('queue')
		.setDescription('View the current music queue'),
	async execute(interaction) {
		const queue = music.getQueue(interaction.guildId);

		if (!queue || (!queue.current && !queue.songs.length)) {
			return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
		}

		const description = [];

		if (queue.current) {
			description.push(`▶️ **Now playing:** ${queue.current.title} (${queue.current.duration}) • Requested by ${queue.current.requestedBy}`);
		}

		if (queue.songs.length) {
			const upcoming = queue.songs.slice(0, 10).map((song, index) => `${index + 1}. ${song.title} (${song.duration}) • ${song.requestedBy}`);
			description.push('\n**Up next:**\n' + upcoming.join('\n'));
			if (queue.songs.length > 10) {
				description.push(`\n...and ${queue.songs.length - 10} more.`);
			}
		}

		await interaction.reply(description.join('\n'));
	},
};
