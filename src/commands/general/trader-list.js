const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require('discord.js');

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

            // 3. LISTE ERSTELLEN & SORTIEREN
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

                // MC Name (erste 16 Zeichen ohne Sonderzeichen)
                const mcName = member.user.username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
                const headUrl = `https://mc-heads.net/avatar/Mobile/${mcName}`;

                traderList.push({
                    member,
                    stats,
                    avgRating,
                    headUrl,
                    mcName,
                    dcName: member.user.tag
                });
            }

            // Nach Trades sortieren
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 4. HEADER NACHRICHT (Titel)
            const headerContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🏆 • Trader Leaderboard — ${traderList.length} Trader\n\n` +
                        `Sortiert nach abgeschlossenen Trades\n\n` +
                        `Legende: ⭐ = Bewertung | 💎 = Gesamtvolumen`
                    )
                );

            await interaction.editReply({
                components: [headerContainer],
                flags: MessageFlags.IsComponentsV2
            });

            // 5. PRO TRADER: MC KOPF + CONTAINER MIT INFOS
            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;

                // Trader-Container
                const traderContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**${medal} ${trader.mcName}** (${trader.dcName})\n\n` +
                            `| ${trader.stats.completedTrades} Trades |\n` +
                            `| ⭐ ${trader.avgRating} Rating |\n` +
                            `| 💎 ${trader.stats.totalVolume.toFixed(1)}M Volumen |`
                        )
                    );

                // Separater Separator als Trenner
                const separator = new SeparatorBuilder().setDivider(true).setSpacing(1);

                // Nachricht mit Bild-Anhang + Container
                await interaction.channel.send({
                    content: '',
                    components: [traderContainer, separator],
                    files: [{
                        attachment: trader.headUrl,
                        name: `head-${i}.png`
                    }],
                    flags: MessageFlags.IsComponentsV2
                });

                // Kleine Pause zwischen den Nachrichten (Rate Limit vermeiden)
                if (i < traderList.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // 6. FOOTER
            await interaction.channel.send({
                content: '||ℹ️ Alle Trader mit der Rolle werden angezeigt. Letzte Aktualisierung: <t:${Math.floor(Date.now() / 1000)}:R>||'
            });

        } catch (error) {
            console.error('Error in /trader-list:', error);
            await interaction.editReply({
                content: '❌ Fehler beim Laden der Trader-Liste.'
            });
        }
    }
};