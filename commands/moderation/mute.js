const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ensureMutedRole } = require('../../services/moderation');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a member by applying the Muted role')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('Member to mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('member');
        if (!target) {
            return interaction.reply({ content: 'I cannot find that member.', ephemeral: true });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'I need Manage Roles permission to mute members.', ephemeral: true });
        }

        const reason = interaction.options.getString('reason') ?? 'No reason provided';

        try {
            const mutedRole = await ensureMutedRole(interaction.guild);
            if (target.roles.cache.has(mutedRole.id)) {
                return interaction.reply({ content: 'That member is already muted.', ephemeral: true });
            }
            await target.roles.add(mutedRole, reason);
            await interaction.reply({ content: `🔇 ${target.user.tag} has been muted.`, ephemeral: true });
        } catch (error) {
            console.error('Failed to mute member:', error);
            await interaction.reply({ content: 'I could not mute that member.', ephemeral: true });
        }
    },
};
