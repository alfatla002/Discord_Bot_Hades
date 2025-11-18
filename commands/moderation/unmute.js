const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ensureMutedRole } = require('../../services/moderation');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove the Muted role from a member')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('Member to unmute')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('member');
        if (!target) {
            return interaction.reply({ content: 'I cannot find that member.', ephemeral: true });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'I need Manage Roles permission to unmute members.', ephemeral: true });
        }

        try {
            const mutedRole = await ensureMutedRole(interaction.guild);
            if (!target.roles.cache.has(mutedRole.id)) {
                return interaction.reply({ content: 'That member is not muted.', ephemeral: true });
            }
            await target.roles.remove(mutedRole, 'Unmuted via command');
            await interaction.reply({ content: `🔊 ${target.user.tag} has been unmuted.`, ephemeral: true });
        } catch (error) {
            console.error('Failed to unmute member:', error);
            await interaction.reply({ content: 'I could not unmute that member.', ephemeral: true });
        }
    },
};
