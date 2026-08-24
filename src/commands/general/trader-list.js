const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const constants = require('../../config/constants');
const store = require('../../data/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trader-list')
        .setDescription('📋 Zeigt alle Trader mit MC-Köpfen und Statistiken'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 1. TRADER ROLLE HOLEN
            if (!constants.TRADER_ROLE_ID) {
                await interaction.editReply({ content: '❌ Kein TRADER_ROLE_ID konfiguriert.' });
                return;
            }

            const role = await interaction.guild.roles.fetch(constants.TRADER_ROLE_ID);
            if (!role) {
                await interaction.editReply({ content: '❌ Trader-Rolle nicht gefunden.' });
                return;
            }

            const traderMembers = role.members;
            if (traderMembers.size === 0) {
                await interaction.editReply({ content: '❌ Kein Trader mit dieser Rolle.' });
                return;
            }

            // 2. STATS HOLEN
            const traderStats = store.traderStats || {};
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

                const mcName = member.user.username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
                const headUrl = `https://mc-heads.net/avatar/${mcName}/128`;

                traderList.push({
                    member,
                    stats,
                    avgRating,
                    headUrl,
                    mcName,
                    dcName: member.user.username
                });
            }

            // 3. SORTIEREN
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 4. EMBEDS ERSTELLEN — ein Embed pro Trader
            const embeds = [];

            // Header Embed (Titel)
            const headerEmbed = new EmbedBuilder()
                .setTitle('🏆 Trader Leaderboard')
                .setDescription(`**${traderList.length} Trader** — Sortiert nach abgeschlossenen Trades\n\n⭐ = Bewertung | 💎 = Gesamtvolumen`)
                .setColor(0x6d4aff)
                .setFooter({ text: `Yayk Clan Spawner Trading • Stand: heute` });

            embeds.push(headerEmbed);

            // Ein Embed pro Trader
            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${medal} ${trader.mcName}`,
                        iconURL: trader.headUrl
                    })
                    .setDescription(
                        `**Discord:** <@${trader.member.id}>` +
                        (trader.mcName.toLowerCase() !== trader.dcName.toLowerCase()
                            ? ` (\`${trader.dcName}\`)`
                            : '')
                    )
                    .addFields(
                        { name: '✅ Trades', value: `${trader.stats.completedTrades}`, inline: true },
                        { name: '⭐ Bewertung', value: `${trader.avgRating}/5`, inline: true },
                        { name: '💎 Volumen', value: `${trader.stats.totalVolume.toFixed(1)}M`, inline: true },
                        { name: '➕ Eingenommen', value: `${(trader.stats.totalEarned || 0).toFixed(1)}M`, inline: true },
                        { name: '➖ Ausgezahlt', value: `${(trader.stats.totalSpent || 0).toFixed(1)}M`, inline: true },
                        { name: '\u200B', value: '\u200B', inline: true }
                    )
                    .setColor(i < 3 ? [0xFFD700, 0xC0C0C0, 0xCD7F32][i] : 0x6d4aff);

                embeds.push(embed);

                // Discord Limit: max 10 Embeds pro Nachricht
                if (embeds.length === 10 && i < traderList.length - 1) {
                    // Rest folgt in der nächsten Nachricht (Edge Case bei >9 Tradern)
                    break;
                }
            }

            // 5. ALLES IN EINER NACHRICHT
            await interaction.editReply({ embeds });

        } catch (error) {
            console.error('Error in /trader-list:', error);
            await interaction.editReply({ content: '❌ Fehler beim Laden der Trader-Liste.' });
        }
    }
};