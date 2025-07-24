require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } = require('discord.js'); // Added REST and Routes
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DDNET_STATUS_API = "https://api.status.tw/player/name/";
const DDNET_STATS_API = "https://ddstats.tw/player/json";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Still useful for non-slash commands if you keep them
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

// Define your slash commands
const commands = [
    {
        name: 'player',
        description: 'Fetches detailed statistics for a DDNet player.',
        options: [
            {
                name: 'name',
                type: 3, // String type
                description: 'The name of the DDNet player.',
                required: true,
            },
        ],
    },
    {
        name: 'stats', // Alias for 'player' command
        description: 'Fetches detailed statistics for a DDNet player. (Alias for /player)',
        options: [
            {
                name: 'name',
                type: 3, // String type
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
                type: 3, // String type
                description: 'The name of the DDNet player.',
                required: true,
            },
        ],
    },
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is ready to serve. Invite link: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=117760&scope=bot+applications.commands`);

    // Register slash commands globally or for a specific guild
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        // You can register commands globally or per guild.
        // For development, guild commands update faster.
        // To register globally:
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        // To register for a specific guild (replace YOUR_GUILD_ID with your guild's ID):
        // await rest.put(
        //     Routes.applicationGuildCommands(client.user.id, 'YOUR_GUILD_ID'),
        //     { body: commands },
        // );


        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return; // Check if it's a slash command interaction

    const { commandName, options } = interaction;
    const playerName = options.getString('name'); // Get the 'name' option value

    if (commandName === 'player' || commandName === 'stats') {
        if (!playerName) {
            return interaction.reply({ content: 'Please provide a player name!', ephemeral: true }); // ephemeral makes the message only visible to the user
        }

        await interaction.deferReply(); // Acknowledge the interaction, Discord gives you 3 seconds to respond. deferReply gives you more time.

        try {
            const statsResponse = await fetch(`${DDNET_STATS_API}?player=${encodeURIComponent(playerName)}`);
            if (!statsResponse.ok) {
                if (statsResponse.status === 404) {
                    return interaction.editReply(`Player **${playerName}** not found on ddstats.tw. Please check the spelling.`);
                }
                throw new Error(`HTTP error! status: ${statsResponse.status}`);
            }
            const playerData = await statsResponse.json();

            if (!playerData || Object.keys(playerData).length === 0) {
                return interaction.editReply(`Could not find detailed statistics for **${playerName}**.`);
            }

            let onlineStatus = 'Offline';
            let serverInfo = '';
            try {
                const onlineResponse = await fetch(`${DDNET_STATUS_API}${encodeURIComponent(playerName)}`);
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

            // --- ADJUSTED DATA ACCESS BASED ON USER'S LATEST INSTRUCTIONS ---
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
            // --- END ADJUSTMENTS ---

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
                { name: 'Website Link', value: `[Click here for more details](https://zelamuss.github.io/TeeViewer/players.html?player=${encodeURIComponent(playerName)})`, inline: false }
            );

            await interaction.editReply({ embeds: [embed] }); // Use editReply after deferReply

        } catch (error) {
            console.error('Error fetching player stats:', error);
            await interaction.editReply(`An error occurred while fetching player stats for **${playerName}**.`);
        }
    } else if (commandName === 'online') {
        if (!playerName) {
            return interaction.reply({ content: 'Please provide a player name!', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const response = await fetch(`${DDNET_STATUS_API}${encodeURIComponent(playerName)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.players && data.players.length > 0) {
                const player = data.players[0];
                const server = player.server;

                const embed = new EmbedBuilder()
                    .setTitle(`🟢 ${playerName} is Online!`)
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
                await interaction.editReply(`🔴 **${playerName}** is currently **Offline**.`);
            }

        } catch (error) {
            console.error('Error fetching online status:', error);
            await interaction.editReply(`An error occurred while checking online status for **${playerName}**.`);
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);