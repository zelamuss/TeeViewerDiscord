const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
    async execute(interaction, API_ENDPOINTS) {
        await interaction.deferReply();

        const inputName = interaction.options.getString('name');

        if (!inputName) {
            return interaction.editReply({ content: 'Please provide a clan name!', ephemeral: true });
        }

        try {
            const response = await fetch(API_ENDPOINTS.DDNET_CLAN_LIST_API, {
                signal: AbortSignal.timeout(13000)
            });
            if (!response.ok) {
                return interaction.editReply(`The DDNet clan list API might be down or unreachable (Status: ${response.status}). Please retry in a few minutes.`);
            }
            const allClans = await response.json();

            const clanNameLower = inputName.toLowerCase();
            const foundClan = allClans.find(clan => clan.name.toLowerCase() === clanNameLower);

            if (!foundClan) {
                return interaction.editReply(`Clan **${inputName}** not found. Please check the spelling.`);
            }

            const onlinePlayers = foundClan.players.filter(player => player.server).length;
            const afkPlayers = foundClan.players.filter(player => player.isAfk).length;
            const totalMembers = foundClan.players.length;

            let creationDate = 'N/A';
            if (foundClan.createdAt) {
                const dateObj = new Date(foundClan.createdAt);
                const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                // Check for "Jun 1, 2024" specifically
                const jun12024 = new Date('2024-06-01T00:00:00Z'); // UTC reference for consistency
                if (dateObj.toISOString().startsWith(jun12024.toISOString().substring(0, 10))) {
                    creationDate = 'Not available (placeholder date)';
                } else {
                    creationDate = formattedDate;
                }
            }

            let onlinePlayersDetails = '';
            const onlineMembers = foundClan.players.filter(player => player.server);
            if (onlineMembers.length > 0) {
                onlinePlayersDetails = onlineMembers.map(player => {
                    const serverName = player.server.name || 'Unknown Server';
                    const mapName = player.server.map?.name || 'Unknown Map';
                    const ipPort = `${player.server.ip || 'N/A'}:${player.server.port || 'N/A'}`;
                    const afkStatus = player.isAfk ? ' (AFK)' : '';
                    return `• ${player.name}${afkStatus} on **${serverName}** (Map: ${mapName}) [${ipPort}]`;
                }).join('\n');
                if (onlinePlayersDetails.length > 1024) { // Discord embed field limit
                    onlinePlayersDetails = onlinePlayersDetails.substring(0, 1000) + '... (truncated)';
                }
            } else {
                onlinePlayersDetails = 'No players currently online.';
            }

            const embed = new EmbedBuilder()
                .setTitle(`🏠 Clan: ${foundClan.name}`)
                .setColor('#0099ff')
                .addFields(
                    { name: 'Total Members', value: `${totalMembers}`, inline: true },
                    { name: 'Online Players', value: `${onlinePlayers}`, inline: true },
                    { name: 'AFK Players', value: `${afkPlayers}`, inline: true }
                );
            
            if (creationDate !== 'Not available (placeholder date)') {
                embed.addFields({ name: 'Creation Date', value: creationDate, inline: true });
            }

            embed.addFields({ name: 'Online Players & Servers', value: onlinePlayersDetails, inline: false });
            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching clan stats:', error);
            let errorMessage = `An error occurred while fetching clan stats for **${inputName}**.`;
            if (error.name === 'AbortError') {
                errorMessage += ` The request timed out. This often means the DDNet clan list API is down or very slow (ETIMEDOUT).`;
            } else if (error.message.includes('EHOSTUNREACH') || error.message.includes('ETIMEDOUT')) {
                errorMessage += ` The DDNet clan list API is unreachable or timed out (EHOSTUNREACH/ETIMEDOUT). Please retry in a few minutes.`;
            } else {
                errorMessage += ` The DDNet clan list API might be experiencing issues. Please retry in a few minutes.`;
            }
            await interaction.editReply(errorMessage);
        }
    }
};