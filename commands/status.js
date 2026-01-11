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
