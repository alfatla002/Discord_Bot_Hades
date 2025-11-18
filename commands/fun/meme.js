const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Send a random cat meme or photo'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const meme = await fetchCatMeme();
            const embed = new EmbedBuilder()
                .setTitle(meme.title ?? 'Here is a cat meme for you!')
                .setURL(meme.postLink ?? null)
                .setImage(meme.url)
                .setColor(0xffb347);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to fetch cat meme:', error);
            await interaction.editReply('The cat meme vault is temporarily locked.');
        }
    },
};

async function fetchCatMeme() {
    const sources = [
        async () => {
            const response = await axios.get('https://meme-api.com/gimme/catmemes', { timeout: 5000 });
            return response.data;
        },
        async () => {
            const response = await axios.get('https://api.thecatapi.com/v1/images/search', {
                params: { mime_types: 'jpg,png,gif' },
            });
            const image = response.data?.[0];
            if (!image?.url) throw new Error('No cat image returned');
            return {
                title: 'Random cat photo',
                url: image.url,
                postLink: null,
            };
        },
    ];

    for (const source of sources) {
        try {
            const data = await source();
            if (data?.url) {
                return {
                    title: data.title ?? 'Here is a cat meme for you!',
                    url: data.url,
                    postLink: data.postLink ?? null,
                };
            }
        } catch (error) {
            console.warn('Cat meme source failed:', error.message);
        }
    }

    throw new Error('All cat meme sources failed');
}
