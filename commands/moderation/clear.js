const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete a number of recent messages in this channel')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        const count = interaction.options.getInteger('count', true);
        if (count < 1 || count > 100) {
            return interaction.reply({ content: 'Please provide a value between 1 and 100.', ephemeral: true });
        }

        try {
            const deleted = await interaction.channel.bulkDelete(count, true);
            await interaction.reply({ content: `🧹 Deleted ${deleted.size} message(s).`, ephemeral: true });
        } catch (error) {
            console.error('Failed to bulk delete messages:', error);
            await interaction.reply({ content: 'I could not delete those messages. Do I have the right permissions?', ephemeral: true });
        }
    },
};
