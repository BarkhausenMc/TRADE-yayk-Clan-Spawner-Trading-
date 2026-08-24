const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
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
                .setDescription('Alte Trader-Nachricht ersetzen?')
                .setRequired(false)
        ),

    async execute(interaction) {
        // ⭐ Permission prüfen VOR deferReply
        if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
            await interaction.reply({
                content: '❌ Nur Trader Admins dürfen diesen Befehl nutzen!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // ⭐ JETZT erst deferReply (ephemeral — nur für Admin sichtbar)
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

                // MC Name aus stats oder Discord Username
                const mcName = stats.mcName
                    ? stats.mcName
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
                    mcName
                });
            }

            // 3. SORTIEREN
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 4. ALTE NACHRICHT LÖSCHEN
            const overwriteOld = interaction.options.getBoolean('overwrite') ?? true;
            if (overwriteOld && store.getLastTraderListMessageId) {
                const oldMessageId = store.getLastTraderListMessageId();
                if (oldMessageId) {
                    try {
                        const oldMsg = await interaction.channel.messages.fetch(oldMessageId);
                        await oldMsg.delete();
                        console.log('🗑️ Alte Trader-Liste gelöscht');
                    } catch (err) {
                        console.log('⚠️ Alte Nachricht nicht gefunden:', err.message);
                    }
                }
            }

            // 5. CONTAINER BAUEN — mit MC Köpfen als Thumbnails!
            const container = new ContainerBuilder();

            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `**${i + 1}.**`;

                // ⭐ SECTION: MC Head als Thumbnail + Name daneben
                const section = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### ${medal} \`${trader.mcName}\`\n` +
                            `<@${trader.member.id}>`
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder()
                            .setURL(trader.headUrl)
                            .setDescription(`MC Head: ${trader.mcName}`)
                    );

                container.addSectionComponents(section);

                // ⭐ STATS darunter
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> ✅ **${trader.stats.completedTrades}** Trades  ` +
                        `•  ⭐ **${trader.avgRating}**/5  ` +
                        `•  💎 **${trader.stats.totalVolume.toFixed(1)}M** Volumen\n` +
                        `> ➕ **${(trader.stats.totalEarned || 0).toFixed(1)}M** eingekauft  ` +
                        `•  ➖ **${(trader.stats.totalSpent || 0).toFixed(1)}M** verkauft`
                    )
                );

                // ⭐ SEPARATOR zwischen Tradern
                if (i < traderList.length - 1) {
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(1)
                    );
                }
            }

            // 6. PUBLIC NACHRICHT (für alle sichtbar)
            const newMessage = await interaction.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            // 7. MESSAGE ID SPEICHERN
            if (store.setLastTraderListMessageId) {
                store.setLastTraderListMessageId(newMessage.id);
            }

            // 8. ADMIN BESTÄTIGUNG (ephemeral)
            await interaction.editReply({
                content: `✅ Trader-Liste gesendet!`
            });

        } catch (error) {
            console.error('Error in /trader-list:', error);
            try {
                await interaction.editReply({
                    content: '❌ Fehler beim Erstellen der Trader-Liste.'
                });
            } catch (e) {}
        }
    }
};