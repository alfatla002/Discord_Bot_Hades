const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sleep')
        .setDescription('Shut down Hades the chatbot completely'),
    
    async execute(interaction) {
        await interaction.reply('🐾 Hades is going to sleep... Goodbye!');
        
        // Wait for the reply to be sent before terminating the process
        setTimeout(() => {
            console.log('Shutting down the bot...');
            process.exit(0);  // Exit the process with a success code (0)
        }, 1000);  // Give 1 second to ensure the message is sent
    },
};
