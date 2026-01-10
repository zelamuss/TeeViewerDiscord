require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const http = require('http');

// Import command handlers
const playerCommand = require('./commands/player');
const onlineCommand = require('./commands/online');
const statusCommand = require('./commands/status');
const clanCommand = require('./commands/clan');
const clanCommand = require('./commands/serverlist');
// Define API Endpoints and other shared constants
const API_ENDPOINTS = {
    DDNET_STATUS_API: "https://api.status.tw/player/name/",
    DDNET_STATS_API: "https://ddstats.tw/player/json",
    DDNET_OVERALL_STATS_API: "https://api.status.tw/stats",
    DDNET_STATUS_API_ROOT: "https://api.status.tw/",
    DDNET_DDCSTATS_API_ROOT: "https://ddstats.tw/",
    DDNET_CLAN_LIST_API: "https://api.status.tw/clan/list",
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

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

    const { commandName } = interaction;

    switch (commandName) {
        case 'player':
        case 'stats':
            await playerCommand.execute(interaction, API_ENDPOINTS);
            break;
        case 'online':
            await onlineCommand.execute(interaction, API_ENDPOINTS);
            break;
        case 'status':
            await statusCommand.execute(interaction, API_ENDPOINTS);
            break;
        case 'clan':
            await clanCommand.execute(interaction, API_ENDPOINTS);
            break;
        default:
            await interaction.reply({ content: 'Unknown command.', ephemeral: true });
            break;
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
