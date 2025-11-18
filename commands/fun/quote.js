const { SlashCommandBuilder } = require('discord.js');

const CAT_QUOTES = [
    'In ancient times cats were worshipped as gods; they have not forgotten this. – Terry Pratchett',
    'What greater gift than the love of a cat. – Charles Dickens',
    'Cats choose us; we don’t own them. – Kristin Cast',
    'Time spent with cats is never wasted. – Sigmund Freud',
    'A meow massages the heart. – Stuart McMillan',
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get a sassy cat-themed quote from Hades'),
    async execute(interaction) {
        const quote = CAT_QUOTES[Math.floor(Math.random() * CAT_QUOTES.length)];
        await interaction.reply(`🐾 "${quote}"`);
    },
};
