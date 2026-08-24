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
        .setDescription('📋 Erstellt eine öffentliche Trader-Liste für die Community')
        .addBooleanOption(opt =>
            opt.setName('overwrite')
                .setDescription('Alte Trader-Nachricht ersetzen? (ansonsten neue Nachricht)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // ⭐ KEIN deferReply - wir wollen öffentliche Nachricht
        // Erst Permission prüfen
        
        if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
            await interaction.reply({
                content: '❌ Nur Trader Admins dürfen diese Nachricht erstellen!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const overwriteOld = interaction.options.getBoolean('overwrite') ?? true;

        try {
            // 1. TRADER ROLLE HOLEN
            if (!constants.TRADER_ROLE_ID) {
                await interaction.reply({
                    content: '❌ Kein TRADER_ROLE_ID in constants.js konfiguriert.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const role = await interaction.guild.roles.fetch(constants.TRADER_ROLE_ID);
            if (!role) {
                await interaction.reply({
                    content: '❌ Trader-Rolle nicht gefunden.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const traderMembers = role.members;
            if (traderMembers.size === 0) {
                await interaction.reply({
                    content: '❌ Kein Trader mit dieser Rolle im Server.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // 2. STATS AUS STORE HOLEN
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

                // MC Name aus Stats holen, falls vorhanden
                const savedMcName = stats.mcName;
                const mcName = savedMcName 
                    ? savedMcName 
                    : member.user.username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
                
                const avgRating = stats.starCount > 0
                    ? (stats.totalStars / stats.starCount).toFixed(1)
                    : 'N/A';

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

            // 3. SORTIEREN NACH TRADES
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 4. ALTE NACHRICHT LÖSCHEN WENN OVERWRITE
            const oldMessageId = store.getLastTraderListMessageId?.();
            if (overwriteOld && oldMessageId) {
                try {
                    const oldMsg = await interaction.channel.messages.fetch(oldMessageId);
                    await oldMsg.delete();
                    console.log('🗑️ Alte Trader-Liste gelöscht');
                } catch (err) {
                    console.log('⚠️ Alte Nachricht nicht gefunden:', err.message);
                }
            }

            // 5. HEADER EMBED
            const headerEmbed = new EmbedBuilder()
                .setTitle('🏆 Offizielle Trader-Liste')
                .setDescription(
                    `**${traderList.length} verifizierte Trader**\n` +
                    `Sortiert nach abgeschlossenen Trades\n\n` +
                    `⭐ = Durchschnittsbewertung | 💎 = Gesamtvolumen`
                )
                .setColor(0x6d4aff)
                .setFooter({ 
                    text: 'Yayk Clan Spawner Trading • Nur Trusted Trader' 
                })
                .setTimestamp();

            // 6. TRADER EMBEDS ERSTELLEN
            const embeds = [headerEmbed];

            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${medal} ${trader.mcName}`,
                        iconURL: trader.headUrl
                    })
                    .addFields(
                        { 
                            name: '👤 Discord', 
                            value: `<@${trader.member.id}>`, 
                            inline: true 
                        },
                        { 
                            name: '✅ Trades', 
                            value: `**${trader.stats.completedTrades}**`, 
                            inline: true 
                        },
                        { 
                            name: '⭐ Bewertung', 
                            value: `${trader.avgRating}/5`, 
                            inline: true 
                        },
                        { 
                            name: '💎 Volumen', 
                            value: `${trader.stats.totalVolume.toFixed(1)}M`, 
                            inline: true 
                        },
                        { 
                            name: '➕ Eingenommen', 
                            value: `${(trader.stats.totalEarned || 0).toFixed(1)}M`, 
                            inline: true 
                        },
                        { 
                            name: '➖ Ausgezahlt', 
                            value: `${(trader.stats.totalSpent || 0).toFixed(1)}M`, 
                            inline: true 
                        }
                    )
                    .setColor(i < 3 ? [0xFFD700, 0xC0C0C0, 0xCD7F32][i] : 0x6d4aff);

                embeds.push(embed);

                // Discord Limit: max 10 Embeds pro Nachricht
                if (embeds.length >= 10) break;
            }

            // 7. PUBLIC NACHRICHT SENDEN
            const newMessage = await interaction.channel.send({ embeds });

            // 8. MESSAGE ID SPEICHERN FÜR OVERWRITE
            if (store.setLastTraderListMessageId) {
                store.setLastTraderListMessageId(newMessage.id);
            }

            await interaction.reply({
                content: `✅ Trader-Liste erstellt in <#${interaction.channel.id}>!`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error in /trader-list:', error);
            try {
                await interaction.reply({
                    content: '❌ Fehler beim Erstellen der Trader-Liste.',
                    flags: MessageFlags.Ephemeral
                });
            } catch (e) {
                // Ignore - könnte schon beantwortet sein
            }
        }
    }
};