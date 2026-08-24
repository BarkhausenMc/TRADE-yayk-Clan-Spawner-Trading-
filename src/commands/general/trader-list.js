const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');

// ⭐ KORREKTER PFAD (2x hochgehen)
const constants = require('../../config/constants');
const store = require('../../data/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trader-list')
        .setDescription('📋 Zeigt alle Trader mit MC-Köpfen und Statistiken'),

    async execute(interaction) {
        // ⭐ SOFORT deferReply
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 1. TRADER ROLLE HOLEN
            if (!constants.TRADER_ROLE_ID) {
                await interaction.editReply({
                    content: '❌ Kein TRADER_ROLE_ID in constants.js konfiguriert.'
                });
                return;
            }

            const role = await interaction.guild.roles.fetch(constants.TRADER_ROLE_ID);
            if (!role) {
                await interaction.editReply({
                    content: '❌ Trader-Rolle nicht gefunden.'
                });
                return;
            }

            const traderMembers = role.members;
            if (traderMembers.size === 0) {
                await interaction.editReply({
                    content: '❌ Kein Trader mit dieser Rolle im Server.'
                });
                return;
            }

            // 2. STATS AUS STORE HOLEN
            const traderStats = store.traderStats || {};

            // 3. LISTE ERSTELLEN
            const traderList = [];

            for (const [memberId, member] of traderMembers) {
                const stats = traderStats[memberId] || {
                    completedTrades: 0,
                    totalVolume: 0,
                    totalEarned: 0,
                    totalSpent: 0,
                    totalStars: 0,
                    starCount: 0
                };

                const avgRating = stats.starCount > 0
                    ? (stats.totalStars / stats.starCount).toFixed(1)
                    : 'N/A';

                // MC Name (Discord Username verwenden)
                const mcName = member.user.username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
                const headUrl = `https://mc-heads.net/avatar/${mcName}/64`;

                traderList.push({
                    member,
                    stats,
                    avgRating,
                    headUrl,
                    mcName
                });
            }

            // 4. NACH TRADES SORTIEREN
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 5. TEXT FÜR EMBED BASTELN
            const leaderboard = traderList.map((trader, i) => {
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
                const trades = trader.stats.completedTrades;
                const rating = trader.avgRating;
                const volume = trader.stats.totalVolume.toFixed(1);
                return `${medal} <@${trader.member.id}> | ${trades} Trades | ⭐ ${rating} | 💎 ${volume}M`;
            }).join('\n');

            // 6. NACHRICHT SENDEN
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🏆 • Trader Leaderboard — ${traderList.length} Trader\n\n` +
                        `Sortiert nach abgeschlossenen Trades\n\n` +
                        `---\n\n` +
                        leaderboard + '\n\n' +
                        `||MC Köpfe via mc-heads.net||`
                    )
                );

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            // 7. MC KÖPFE ALSE ANHÄNGE (optional)
            for (let i = 0; i < Math.min(traderList.length, 5); i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;

                try {
                    await interaction.channel.send({
                        content: `**${medal} ${trader.mcName}** — ${trader.stats.completedTrades} Trades | ⭐ ${trader.avgRating}`,
                        files: [{
                            attachment: trader.headUrl,
                            name: `head-${i}.png`
                        }]
                    });
                } catch (err) {
                    console.log(`Head laden fehlgeschlagen: ${trader.mcName}`, err.message);
                }
            }

        } catch (error) {
            console.error('Error in /trader-list:', error);
            await interaction.editReply({
                content: '❌ Fehler beim Laden der Trader-Liste.'
            });
        }
    }
};