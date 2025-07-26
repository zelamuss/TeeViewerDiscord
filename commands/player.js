const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
    async execute(interaction, API_ENDPOINTS) {
        await interaction.deferReply();

        const inputName = interaction.options.getString('name');

        if (!inputName) {
            return interaction.editReply({ content: 'Please provide a player name!', ephemeral: true });
        }

        try {
            const statsResponse = await fetch(`${API_ENDPOINTS.DDNET_STATS_API}?player=${encodeURIComponent(inputName)}`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!statsResponse.ok) {
                if (statsResponse.status === 404) {
                    return interaction.editReply(`Player **${inputName}** not found on ddstats.tw. Please check the spelling.`);
                }
                return interaction.editReply(`ddstats.tw API might be down or unreachable (Status: ${statsResponse.status}). Please retry in a few minutes. If this persists, the API might be experiencing issues like ETIMEDOUT or EHOSTUNREACH.`);
            }
            const playerData = await statsResponse.json();

            if (!playerData || Object.keys(playerData).length === 0) {
                return interaction.editReply(`Could not find detailed statistics for **${inputName}**.`);
            }

            let onlineStatus = 'Offline';
            let serverInfo = '';
            try {
                const onlineResponse = await fetch(`${API_ENDPOINTS.DDNET_STATUS_API}${encodeURIComponent(inputName)}`, {
                    signal: AbortSignal.timeout(5000)
                });
                if (onlineResponse.ok) {
                    const onlineData = await onlineResponse.json();
                    if (onlineData.players && onlineData.players.length > 0) {
                        const playerStatus = onlineData.players[0];
                        onlineStatus = 'Online';
                        if (playerStatus.server) {
                            serverInfo = `\n**Server:** ${playerStatus.server.name || 'N/A'}\n**Map:** ${playerStatus.server.map.name || 'N/A'}\n**Game Type:** ${playerStatus.server.gameType.name || 'N/A'}\n**Server IP:PORT:** ${playerStatus.server.ip}:${playerStatus.server.port}`;
                        }
                    }
                }
            } catch (onlineError) {
                console.error("Error fetching online status (non-critical):", onlineError.message);
            }

            const primaryRecentInfo = playerData.recent_player_info && playerData.recent_player_info.length > 0
                                     ? playerData.recent_player_info[0]
                                     : {};

            const playerNameDisplay = primaryRecentInfo.name || 'N/A';
            const clan = primaryRecentInfo.clan || 'N/A';
            const country = primaryRecentInfo.country && primaryRecentInfo.country !== -1 ? primaryRecentInfo.country : 'N/A';
            const skinName = primaryRecentInfo.skin_name || 'default';
            const skinbodyColor = primaryRecentInfo.skin_color_body || null;
            const skinfeetColor = primaryRecentInfo.skin_color_feet || null;
            const lastSeenTimestamp = primaryRecentInfo.last_seen || null;

            const effectiveBodyColor = skinbodyColor !== null ? skinbodyColor.toString() : '';
            const effectiveFeetColor = skinfeetColor !== null ? skinfeetColor.toString() : '';

            let currentTeeAssemblerString;
            if (skinbodyColor === null || skinfeetColor === null) {
                currentTeeAssemblerString = `player_skin ${skinName}; player_use_custom_color 0`;
            } else {
                currentTeeAssemblerString = `player_skin ${skinName}; player_color_body ${effectiveBodyColor}; player_color_feet ${effectiveFeetColor}; player_use_custom_color 1`;
            }

            // Generate skin image URL (simple approach without pre-validation)
            let skinImageUrl = null;
            if (skinName && skinName !== 'N/A' && skinName !== 'default') {
                if (skinbodyColor !== null && skinfeetColor !== null) {
                    // Use custom colors
                    skinImageUrl = `https://render-tw-skins.deno.dev/render/${encodeURIComponent(skinName)}/${skinbodyColor}/${skinfeetColor}`;
                } else {
                    // Use default colors (0 for both body and feet)
                    skinImageUrl = `https://render-tw-skins.deno.dev/render/${encodeURIComponent(skinName)}/0/0`;
                }
            }

            const points = playerData.profile.points || 'N/A';
            const totalFinishes = playerData.total_finishes || (playerData.finishes ? playerData.finishes.length : 'N/A');
            const totalSecondsPlayed = playerData.general_activity.total_seconds_played || 'N/A';
            const startedPlayingTimestamp = playerData.first_seen || null;

            const totalPlayTimeFormatted = `${Math.round(totalSecondsPlayed / 3600)}h`;

            const embed = new EmbedBuilder()
                .setTitle(`📈 Statistics for ${playerNameDisplay}`)
                .setColor(onlineStatus === 'Online' ? '#00ff00' : '#ff0000')
                .setDescription(`**Status:** ${onlineStatus}${serverInfo}`)
                .addFields(
                    { name: 'Points', value: `${points}`, inline: true },
                    { name: 'Clan', value: `${clan}`, inline: true },
                    { name: 'Country', value: `${country}`, inline: true },
                    { name: 'Total Finishes', value: `${totalFinishes}`, inline: true },
                    { name: 'Total Playtime', value: `${totalPlayTimeFormatted}`, inline: true },
                    { name: 'Skin Name', value: `${skinName}`, inline: true },
                    
                );
            
            
            // Add skin image as thumbnail if available
            if (skinImageUrl) {
                embed.setThumbnail(skinImageUrl);
            }
            
            if (lastSeenTimestamp) {
                const lastSeenDate = new Date(lastSeenTimestamp).toLocaleString();
                embed.addFields({ name: 'Last Seen', value: lastSeenDate, inline: true });
            }
            if (startedPlayingTimestamp) {
                const startedPlayingDate = new Date(startedPlayingTimestamp).toLocaleString();
                embed.addFields({ name: 'Started Playing', value: startedPlayingDate, inline: true });
            }

            if (playerData.recent_top_10s && Array.isArray(playerData.recent_top_10s) && playerData.recent_top_10s.length > 0) {
                const top10RecentText = playerData.recent_top_10s.slice(0, 5)
                    .map(item => `• ${item.map || 'N/A'} (Rank: ${item.rank || 'N/A'})`)
                    .join('\n');
                embed.addFields({ name: 'Recent Top 10s', value: top10RecentText, inline: true });
            } else {
                embed.addFields({ name: 'Recent Top 10s', value: 'No data available', inline: true });
            }

            if (playerData.all_top_10s && Array.isArray(playerData.all_top_10s) && playerData.all_top_10s.length > 0) {
                const top10AllText = playerData.all_top_10s.slice(0, 5)
                    .map(item => `• ${item.map.map || 'N/A'} (Rank: ${item.rank || 'N/A'})`)
                    .join('\n');
                embed.addFields({ name: 'All Time Top 10s', value: top10AllText, inline: true });
            } else {
                embed.addFields({ name: 'All Time Top 10s', value: 'No data available', inline: true });
            }

            if (playerData.favourite_teammates && Array.isArray(playerData.favourite_teammates) && playerData.favourite_teammates.length > 0) {
                const favTeammatesText = playerData.favourite_teammates.slice(0, 3)
                    .map(team => `• ${team.name || 'N/A'} (${team.ranks_together || 0} ranks)`)
                    .join('\n');
                embed.addFields({ name: 'Favourite Teammates', value: favTeammatesText, inline: false });
            } else {
                embed.addFields({ name: 'Favourite Teammates', value: 'No data available', inline: false });
            }
            embed.addFields(
                { name: 'Skin Command', value: currentTeeAssemblerString, inline: false }
            );
            embed.addFields(
                { name: 'Website Link', value: `[Click here for more details](https://zelamuss.github.io/TeeViewer/players.html?player=${encodeURIComponent(inputName)})`, inline: false }
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching player stats:', error);
            let errorMessage = `An error occurred while fetching player stats for **${inputName}**.`;
            if (error.name === 'AbortError') {
                errorMessage += ` The request timed out. This often means the DDNet stats API is down or very slow (ETIMEDOUT).`;
            } else if (error.message.includes('EHOSTUNREACH') || error.message.includes('ETIMEDOUT')) {
                errorMessage += ` The DDNet stats API is unreachable or timed out (EHOSTUNREACH/ETIMEDOUT). Please retry in a few minutes.`;
            } else {
                errorMessage += ` The DDNet stats API might be experiencing issues. Please retry in a few minutes.`;
            }
            await interaction.editReply(errorMessage);
        }
    }
};