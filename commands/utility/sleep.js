const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sleep')
        .setDescription('Shut down Hades the chatbot completely')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }

        await interaction.reply('🐾 Hades is going to sleep... Goodbye!');
        
        // Wait for the reply to be sent before terminating the process
        setTimeout(() => {
            console.log('Shutting down the bot...');
            process.exit(0);  // Exit the process with a success code (0)
        }, 1000);  // Give 1 second to ensure the message is sent
    },
};
