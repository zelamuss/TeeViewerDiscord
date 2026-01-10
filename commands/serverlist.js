const { EmbedBuilder } = require('discord.js');

module.exports = {
    async execute(interaction) {
        // Check if user is authorized
        if (interaction.user.id !== '1221080840411549708') {
            await interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                ephemeral: true 
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guilds = interaction.client.guilds.cache;
        let serverListDescription = `**Bot is in ${guilds.size} servers:**\n\n`;

        for (const [guildId, guild] of guilds) {
            serverListDescription += `**${guild.name}** (ID: ${guild.id})\n`;
            serverListDescription += `• Members: ${guild.memberCount}\n`;

            try {
                // Check if bot has permission to create invites
                const botMember = await guild.members.fetch(interaction.client.user.id);
                const channels = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased());
                
                let inviteCreated = false;
                for (const [channelId, channel] of channels) {
                    if (channel.permissionsFor(botMember).has('CreateInstantInvite')) {
                        try {
                            const invite = await channel.createInvite({
                                maxAge: 0, // Never expires
                                maxUses: 0, // Unlimited uses
                                reason: 'Server list command'
                            });
                            serverListDescription += `• Invite: ${invite.url}\n`;
                            inviteCreated = true;
                            break;
                        } catch (err) {
                            console.error(`Failed to create invite for ${guild.name}:`, err);
                        }
                    }
                }

                if (!inviteCreated) {
                    serverListDescription += `• Invite: No permission to create invite\n`;
                }
            } catch (error) {
                console.error(`Error processing guild ${guild.name}:`, error);
                serverListDescription += `• Invite: Error fetching permissions\n`;
            }

            serverListDescription += '\n';
        }

        // Split into multiple messages if too long (Discord limit is 4096 chars per embed)
        const chunks = [];
        const lines = serverListDescription.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            if ((currentChunk + line + '\n').length > 4000) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        // Send first chunk as edit, rest as follow-ups
        const firstEmbed = new EmbedBuilder()
            .setTitle('🔧 Server List')
            .setColor('#00FF00')
            .setDescription(chunks[0])
            .setTimestamp();

        await interaction.editReply({ embeds: [firstEmbed] });

        for (let i = 1; i < chunks.length; i++) {
            const embed = new EmbedBuilder()
                .setTitle(`🔧 Server List (Continued ${i})`)
                .setColor('#00FF00')
                .setDescription(chunks[i])
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
    }
};
