const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const path = require('path');

// Load .env from repo root (more reliable under PM2)
require('dotenv').config({ path: path.resolve(__dirname, '../../..', '.env') });

const BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function makeRequest(question, attempt = 1) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is missing. Check your .env on the server.');
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: '"You are Hades, a witty and sarcastic cat. Though you have the name hades, you can be a soft teddy bear, you may love snuggles etc. Respond conversationally. Do not narrate physical cat actions like stretching or arching. Unless directly relevant, but avoid doing so."' },
          { role: 'user', content: question }
        ],
        max_tokens: 150,
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data.choices?.[0]?.message?.content ?? '(no response)';
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = err?.message;

    // Retry 429 rate limit (cap attempts)
    if (status === 429 && attempt <= 3) {
      const retryAfterHeader = err.response.headers?.['retry-after'];
      const retrySeconds = Number(retryAfterHeader) || 30;
      console.error(`[Groq] 429 rate limit. Retry in ${retrySeconds}s (attempt ${attempt}/3).`);
      await sleep(retrySeconds * 1000);
      return makeRequest(question, attempt + 1);
    }

    console.error('[Groq] Request failed:', { status, msg, data });
    throw new Error(`Groq API error${status ? ` (${status})` : ''}: ${data?.error?.message || msg}`);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Hades the cat a question!')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The question you want to ask Hades the cat')
        .setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    await interaction.deferReply();

    try {
      const gptResponse = await makeRequest(question);
      await interaction.editReply(`🐾 **You asked:** "${question}"\n\n**Hades says:** "${gptResponse}"`);
    } catch (error) {
      console.error('[ask] Command failed:', error);
      await interaction.editReply(`There was an error processing your request.\n\`\`\`${String(error.message || error)}\`\`\``);
    }
  },
};
