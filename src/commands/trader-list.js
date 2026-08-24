const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');

const axios = require('axios');
const constants = require('../config/constants');
const store = require('../data/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trader-list')
        .setDescription('📋 Zeigt alle Trader mit MC-Köpfen und Statistiken'),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        // ⭐ Sofort defer — keine Unknown Interaction!
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
                    content: '❌ Trader-Rolle nicht gefunden in diesem Server.'
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

            // 3. MC HEADS CACHEN (für Performance)
            const headCache = new Map();

            // 4. FÜR JEDEN TRADER HEAD + STATS HOLEN
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

                // MC Name aus Discord Username holen (vereinfacht — bei dir ggf. anpassen)
                const mcName = member.displayName.replace(/[^a-zA-Z0-9_]/g, '');

                // MC Head URL (mc-heads.net)
                const headUrl = `https://mc-heads.net/avatar/${mcName}/64`;
                headCache.set(memberId, headUrl);

                traderList.push({
                    member,
                    stats,
                    avgRating,
                    headUrl
                });
            }

            // 5. LISTE NACH TRADES SORTIEREN
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 6. NACH CHUNKS AUFTEILEN (Discord Limits beachten!)
            const maxEmbedLength = 4096;
            const chunks = [];
            let currentChunk = '';
            let currentContainer = null;

            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
                
                const line = `\n${medal} <@${trader.member.id}> — ${trader.stats.completedTrades} Trades | ⭐ ${trader.avgRating} | 💎 ${trader.stats.totalVolume.toFixed(1)}M`;
                
                // Einfachheitshalber: Alle in EINER Nachricht (wenn zu lang → Fehlerhandling)
                currentChunk += line;
            }

            // 7. NACHRICHT MIT HEADS SENDEN
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🏆 • Trader Leaderboard — ${traderList.length} Trader\n\n` +
                        `Sortiert nach abgeschlossenen Trades\n` +
                        `Legende: ⭐ = Bewertung | 💎 = Gesamtvolumen\n\n` +
                        `---\n` +
                        currentChunk.trim() + '\n\n' +
                        `||ℹ️ MC Köpfe laden über mc-heads.net||`
                    )
                );

            // Für jeden Trader Head als Avatar in separater Nachricht (weil Container kein Bild)
            await interaction.editReply({
                content: null, // Content nicht setzen mit IsComponentsV2!
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            // Optional: Head-Bilder als separate Nachrichten (falls gewünscht)
            for (let i = 0; i < Math.min(traderList.length, 10); i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;

                const headContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**${medal} <@${trader.member.id}>**\n` +
                            `Trades: ${trader.stats.completedTrades} | ⭐ ${trader.avgRating}`
                        )
                    );

                try {
                    await interaction.channel.send({
                        content: '',
                        components: [headContainer],
                        files: [{
                            attachment: trader.headUrl,
                            name: `avatar-${i}.png`
                        }],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (err) {
                    console.log('Fehler beim Senden von Head:', trader.member.id, err.message);
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