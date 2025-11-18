const { SlashCommandBuilder } = require('discord.js');

const reminders = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Ask Hades to remind you later')
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('How many minutes until the reminder (1-1440)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What should I remind you about?')
                .setRequired(true)),
    async execute(interaction) {
        const minutes = interaction.options.getInteger('minutes', true);
        const message = interaction.options.getString('message', true);

        if (minutes < 1 || minutes > 1440) {
            return interaction.reply({ content: 'Please choose between 1 minute and 24 hours.', ephemeral: true });
        }

        const delay = minutes * 60 * 1000;
        const reminderId = `${interaction.user.id}:${Date.now()}`;

        const timeout = setTimeout(async () => {
            try {
                const channel = await interaction.client.channels.fetch(interaction.channelId);
                await channel.send(`⏰ <@${interaction.user.id}> reminder: ${message}`);
            } catch (error) {
                console.error('Failed to deliver reminder:', error);
            } finally {
                reminders.delete(reminderId);
            }
        }, delay);

        reminders.set(reminderId, timeout);
        await interaction.reply({ content: `⏰ I'll remind you in ${minutes} minute(s).`, ephemeral: true });
    },
};
