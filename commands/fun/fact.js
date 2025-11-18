const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fact')
        .setDescription('Share a random cat fact'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const response = await axios.get('https://catfact.ninja/fact');
            const fact = response.data?.fact ?? 'Cats are mysterious fluffballs.';
            await interaction.editReply(`🐱 **Cat Fact:** ${fact}`);
        } catch (error) {
            console.error('Failed to fetch cat fact:', error);
            await interaction.editReply('I could not reach the cat fact server right now.');
        }
    },
};
