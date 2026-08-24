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
        .setDescription('📋 Erstellt eine öffentliche Trader-Liste in Components V2')
        .addBooleanOption(opt =>
            opt.setName('overwrite')
                .setDescription('Alte Trader-Nachricht ersetzen?')
                .setRequired(false)
        ),

    async execute(interaction) {
        // ⭐ SOFORT deferReply, damit die Interaction nicht abläuft!
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 1. PERMISSION PRÜFEN
            if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
                await interaction.editReply({ content: '❌ Nur Trader Admins dürfen diesen Befehl nutzen!' });
                return;
            }

            // 2. TRADER ROLLE HOLEN
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

            // 3. STATS HOLEN
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

                const mcName = stats.mcName
                    ? stats.mcName
                    : member.user.username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);

                const avgRating = stats.starCount > 0
                    ? (stats.totalStars / stats.starCount).toFixed(1)
                    : 'N/A';

                traderList.push({
                    member,
                    stats,
                    avgRating,
                    headUrl: `https://mc-heads.net/avatar/${mcName}/128`,
                    mcName
                });
            }

            // 4. SORTIEREN
            traderList.sort((a, b) => b.stats.completedTrades - a.stats.completedTrades);

            // 5. ALTE NACHRICHT LÖSCHEN
            const overwriteOld = interaction.options.getBoolean('overwrite') ?? true;
            if (overwriteOld && store.getLastTraderListMessageId) {
                const oldMessageId = store.getLastTraderListMessageId();
                if (oldMessageId) {
                    try {
                        const oldMsg = await interaction.channel.messages.fetch(oldMessageId);
                        await oldMsg.delete();
                    } catch (err) {}
                }
            }

            // 6. PURE CV2 CONTAINER BAUEN
            const container = new ContainerBuilder();

            for (let i = 0; i < traderList.length; i++) {
                const trader = traderList[i];
                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `**${i + 1}.**`;

                                container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
        `## 🤝 Unsere Trader\n\n` +
        `Hier findest du unseres Traders.\n`
    )
)
.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(1)
);

                // ⭐ SECTION: MC Head Thumbnail rechts + Name links
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


                // ⭐ SEPARATOR
                if (i < traderList.length - 1) {
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(1)
                    );
                }
            }

            // 7. PUBLIC NACHRICHT (CV2)
            const newMessage = await interaction.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            if (store.setLastTraderListMessageId) {
                store.setLastTraderListMessageId(newMessage.id);
            }

            // 8. ADMIN ANTWORT (CV2)
            const adminReply = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`✅ Trader-Liste wurde veröffentlicht!`)
                );

            await interaction.editReply({
                components: [adminReply],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error('Error in /trader-list:', error);
            try {
                await interaction.editReply({ content: '❌ Fehler beim Erstellen der Trader-Liste.' });
            } catch (e) {}
        }
    }
};