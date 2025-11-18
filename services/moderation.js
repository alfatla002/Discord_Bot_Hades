async function ensureMutedRole(guild) {
    let role = guild.roles.cache.find(r => r.name === 'Muted');
    if (!role) {
        role = await guild.roles.create({
            name: 'Muted',
            color: 0x555555,
            reason: 'Auto-created muted role for moderation commands',
            permissions: [],
        });

        await Promise.all(guild.channels.cache.map(async channel => {
            try {
                await channel.permissionOverwrites.edit(role, {
                    SendMessages: false,
                    AddReactions: false,
                    Speak: false,
                });
            } catch (error) {
                console.warn('Failed to set muted role permissions for channel', channel.id, error.message);
            }
        }));
    }
    return role;
}

module.exports = {
    ensureMutedRole,
};
