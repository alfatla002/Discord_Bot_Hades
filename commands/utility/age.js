const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('age')
		.setDescription('Replies with Age!'),
	async execute(interaction) {
		await interaction.reply(`I'm only ${age} years old! My birthday is on 2020-10-13`);
	},
};

// Function to calculate age
function calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDifference = today.getMonth() - birth.getMonth();

    // Adjust the age if the birthdate hasn't occurred yet this year
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
        age--;
    }

    return age;
}

// Replace this with your actual birthdate
const birthDate = '2020-10-13';
const age = calculateAge(birthDate);

