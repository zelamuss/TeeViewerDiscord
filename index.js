require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const http = require('http');

const DDNET_STATUS_API = "https://api.status.tw/player/name/";
const DDNET_STATS_API = "https://ddstats.tw/player/json";
const DDNET_OVERALL_STATS_API = "https://api.status.tw/stats";
const DDNET_STATUS_API_ROOT = "https://api.status.tw/";
const DDNET_DDCSTATS_API_ROOT = "https://ddstats.tw/";
const DDNET_CLAN_LIST_API = "https://api.status.tw/clan/list"; // New API for clan list

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "N/A";
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
}

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

// Define your slash commands
const commands = [
    {
        name: 'player',
        description: 'Fetches detailed statistics for a DDNet player.',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'The name of the DDNet player.',
                required: true,
            },
        ],
    },
    {
        name: 'stats',
        description: 'Fetches detailed statistics for a DDNet player. (Alias for /player)',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'The name of the DDNet player.',
                required: true,
            },
        ],
    },
    {
        name: 'online',
        description: 'Checks the online status of a DDNet player.',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'The name of the DDNet player.',
                required: true,
            },
        ],
    },
    {
        name: 'status',
        description: 'Shows the current status of DDNet APIs and servers.',
    },
    {
        name: 'clan',
        description: 'Fetches information for a DDNet clan.',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'The name of the DDNet clan.',
                required: true,
            },
        ],
    },
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is ready to serve. Invite link: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=117760&scope=bot+applications.commands`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;
    const inputName = options.getString('name'); // Use inputName for general, then specialize

    if (commandName === 'player' || commandName === 'stats') {
        await interaction.deferReply();

        if (!inputName) {
            return interaction.editReply({ content: 'Please provide a player name!', ephemeral: true });
        }

        try {
            const statsResponse = await fetch(`${DDNET_STATS_API}?player=${encodeURIComponent(inputName)}`, {
                signal: AbortSignal.timeout(3000)
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
                const onlineResponse = await fetch(`${DDNET_STATUS_API}${encodeURIComponent(inputName)}`, {
                    signal: AbortSignal.timeout(3000)
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
                    { name: 'Skin Name', value: `${skinName}`, inline: true }
                );

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
    } else if (commandName === 'online') {
        await interaction.deferReply();

        if (!inputName) {
            return interaction.editReply({ content: 'Please provide a player name!', ephemeral: true });
        }

        try {
            const response = await fetch(`${DDNET_STATUS_API}${encodeURIComponent(inputName)}`, {
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                return interaction.editReply(`The DDNet status API might be down or unreachable (Status: ${response.status}). Please retry in a few minutes. If this persists, the API might be experiencing issues like ETIMEDOUT or EHOSTUNREACH.`);
            }
            const data = await response.json();

            if (data.players && data.players.length > 0) {
                const player = data.players[0];
                const server = player.server;

                const embed = new EmbedBuilder()
                    .setTitle(`🟢 ${inputName} is Online!`)
                    .setColor('#00ff00')
                    .addFields(
                        { name: 'Server Name', value: server.name || 'N/A', inline: false },
                        { name: 'Map', value: server.map.name || 'N/A', inline: false },
                        { name: 'Game Type', value: server.gameType.name || 'N/A', inline: true },
                        { name: 'Server Version', value: server.version.version || 'N/A', inline: true },
                        { name: 'Server Address', value: `${server.ip || 'N/A'}:${server.port || 'N/A'}`, inline: false },
                    );
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`🔴 **${inputName}** is currently **Offline**.`);
            }

        } catch (error) {
            console.error('Error fetching online status:', error);
            let errorMessage = `An error occurred while checking online status for **${inputName}**.`;
            if (error.name === 'AbortError') {
                errorMessage += ` The request timed out. This often means the DDNet status API is down or very slow (ETIMEDOUT).`;
            } else if (error.message.includes('EHOSTUNREACH') || error.message.includes('ETIMEDOUT')) {
                errorMessage += ` The DDNet status API is unreachable or timed out (EHOSTUNREACH/ETIMEDOUT). Please retry in a few minutes.`;
            } else {
                errorMessage += ` The DDNet status API might be experiencing issues. Please retry in a few minutes.`;
            }
            await interaction.editReply(errorMessage);
        }
    } else if (commandName === 'status') {
        await interaction.deferReply();

        let statusDescription = '';
        let embedColor = '#FFD700';

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
            const overallStatsResponse = await fetch(DDNET_OVERALL_STATS_API, {
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
        const apiEndpoints = [
            { url: DDNET_STATUS_API_ROOT + 'stats', name: 'api.status.tw/stats' },
            { url: DDNET_DDCSTATS_API_ROOT + 'player/json?player=DDNet', name: 'ddstats.tw/player/json' }
        ];

        const apiPromises = apiEndpoints.map(async (api) => {
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
    } else if (commandName === 'clan') {
        await interaction.deferReply();

        if (!inputName) {
            return interaction.editReply({ content: 'Please provide a clan name!', ephemeral: true });
        }

        try {
            const response = await fetch(DDNET_CLAN_LIST_API, {
                signal: AbortSignal.timeout(13000) // Increased timeout for potentially larger data fetch
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
});

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is running and alive!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server listening on 0.0.0.0:${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);