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
            const response = await fetch(`${API_ENDPOINTS.DDNET_STATUS_API}${encodeURIComponent(inputName)}`, {
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                return interaction.editReply(`❗ ${inputName} is not found.`);
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
    }

};
