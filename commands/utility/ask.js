const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Function to make a request to the Groq API
async function makeRequest(question) {
    try {
        const response = await axios.post(`${BASE_URL}/chat/completions`, {
            model: 'gemma-7b-it', // Groq-supported model
            messages: [
                { role: 'system', content: 'You are Hades the cat, a sassy and witty cat who likes to help but with a playful attitude.' }, // Set up Hades' persona
                { role: 'user', content: question }
            ],
            max_tokens: 150,
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        return response.data.choices[0].message.content;

    } catch (error) {
        if (error.response && error.response.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 30;
            console.error(`Rate limit hit. Retrying after ${retryAfter} seconds.`);
            await sleep(retryAfter * 1000);
            return makeRequest(question);
        } else {
            throw new Error('Error calling Groq API:', error.message);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Hades the cat a question!')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question you want to ask Hades the cat')
                .setRequired(true)),
    
    async execute(interaction) {
        const question = interaction.options.getString('question');
        
        await interaction.deferReply();

        try {
            const gptResponse = await makeRequest(question);
            // Respond with both the question and Hades' answer
            await interaction.editReply(`🐾 **You asked:** "${question}"\n\n**Hades says:** "${gptResponse}"`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('There was an error processing your request.');
        }
    },
};
