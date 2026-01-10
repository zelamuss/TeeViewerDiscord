const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function pingServer(host) {
    const startTime = process.hrtime.bigint();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`https://${host}`, {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store'
        });
        clearTimeout(timeoutId);
        const endTime = process.hrtime.bigint();
        const latency = Number(endTime - startTime) / 1_000_000;
        return { host, result: `${latency.toFixed(2)} ms (Online)` };
    } catch (error) {
        const endTime = process.hrtime.bigint();
        const latency = Number(endTime - startTime) / 1_000_000;
        console.error(`Error pinging ${host}:`, error.message);
        if (error.name === 'AbortError') {
            return { host, result: `Timeout (${latency.toFixed(2)} ms)` };
        }
        return { host, result: `Offline (${latency.toFixed(2)} ms)` };
    }
}

module.exports = {
    async execute(interaction, API_ENDPOINTS) {
        // Check if this is the server list command for authorized user
        if (interaction.commandName === 'serverlisttypeshit') {
            if (interaction.user.id !== '1221080840411549708') {
                await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
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

            return;
        }

        // Original status command logic
        await interaction.deferReply();

        let statusDescription = '';
        let embedColor = '#FFD700';
        const botGuildCount = interaction.client.guilds.cache.size;
        
        statusDescription += "**Server Pings:**\n";
        const serversToPing = [
            { host: 'master1.ddnet.org', name: 'master1.ddnet.org' },
            { host: 'master2.ddnet.org', name: 'master2.ddnet.org' },
            { host: 'ddnet.org', name: 'ddnet.org' },
            { host: 'forum.ddnet.org', name: 'forum.ddnet.org' },
            { host: 'wiki.ddnet.org', name: 'wiki.ddnet.org' },
            { host: 'codedoc.ddnet.org', name: 'codedoc.ddnet.org' },
            { host: 'kog.tw', name: 'kog.tw' },
        ];
        statusDescription += `**Bot is in ${botGuildCount} servers.**\n\n`;
        const pingPromises = serversToPing.map(server => pingServer(server.host));
        const pingResults = await Promise.all(pingPromises);

        for (const { host, result } of pingResults) {
            const serverName = serversToPing.find(s => s.host === host).name;
            statusDescription += `• **${serverName}:** ${result}\n`;
            if (result.includes('Offline') || result.includes('Timeout')) {
                embedColor = '#FF0000';
            }
        }
        statusDescription += '\n';

        statusDescription += "**Overall DDNet Statistics:**\n";
        try {
            const overallStatsResponse = await fetch(API_ENDPOINTS.DDNET_OVERALL_STATS_API, {
                signal: AbortSignal.timeout(3000)
            });
            if (!overallStatsResponse.ok) {
                throw new Error(`HTTP error! status: ${overallStatsResponse.status}`);
            }
            const overallStatsData = await overallStatsResponse.json();
            statusDescription += `• **Total Players:** ${overallStatsData.numPlayers.toLocaleString()}\n`;
            statusDescription += `• **Total Servers:** ${overallStatsData.numServers.toLocaleString()}\n`;
            statusDescription += `• **Total Clans:** ${overallStatsData.numClans.toLocaleString()}\n`;
            statusDescription += `• **Total Maps:** ${overallStatsData.numMaps.toLocaleString()}\n`;
        } catch (error) {
            console.error('Error fetching overall stats for /status command:', error);
            statusDescription += `• Overall statistics: Failed to load (API might be down or timed out).\n`;
            embedColor = '#FF0000';
        }
        statusDescription += '\n';

        statusDescription += "**API Response Codes:**\n";
        const apiEndpointsToCheck = [
            { url: API_ENDPOINTS.DDNET_STATUS_API_ROOT + 'stats', name: 'api.status.tw/stats' },
            { url: API_ENDPOINTS.DDNET_DDCSTATS_API_ROOT + 'player/json?player=DDNet', name: 'ddstats.tw/player/json' }
        ];

        const apiPromises = apiEndpointsToCheck.map(async (api) => {
            try {
                const response = await fetch(api.url, {
                    signal: AbortSignal.timeout(3000)
                });
                return { name: api.name, status: response.status, ok: response.ok };
            } catch (error) {
                console.error(`Error fetching API status for ${api.url}:`, error);
                return { name: api.name, status: 'Failed', ok: false, error: error.message };
            }
        });
        const apiResults = await Promise.all(apiPromises);

        for (const api of apiResults) {
            if (api.status === 'Failed') {
                statusDescription += `• **${api.name}:** Status: Failed to reach API (Down or Timed Out)\n`;
                embedColor = '#FF0000';
            } else {
                statusDescription += `• **${api.name}:** Status: ${api.status} (${api.ok ? 'OK' : 'Issue'})\n`;
                if (!api.ok) {
                    embedColor = '#FF0000';
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('🌐 DDNet Service Status')
            .setColor(embedColor)
            .setDescription(statusDescription)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
