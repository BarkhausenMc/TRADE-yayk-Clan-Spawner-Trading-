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
        .setName('set-mcname')
        .setDescription('🎮 MC-Name verknüpfen (nur Trader Admin)')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('Welcher Discord-User?')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('mcname')
                .setDescription('Der Minecraft-Name')
                .setRequired(true)
                .setMaxLength(16)
        ),

    async execute(interaction) {
        // ⭐ SOFORT deferReply (CV2 kompatibel)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

        try {
            // 1. PERMISSION
            if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
                await interaction.editReply({ content: '❌ Nur Trader Admins dürfen diesen Befehl nutzen!' });
                return;
            }

            const targetUser = interaction.options.getUser('user');
            const mcName = interaction.options.getString('mcname').trim();

            // 2. VALIDIEREN
            if (!/^[a-zA-Z0-9_]{3,16}$/.test(mcName)) {
                await interaction.editReply({ content: '❌ Ungültiger MC-Name! Nur Buchstaben, Zahlen und `_`, min. 3, max. 16 Zeichen.' });
                return;
            }

            // 3. STATS OBJ ERSTELLEN FALLS NICHT VORHANDEN
            if (!store.traderStats) {
                store.traderStats = {};
            }

            if (!store.traderStats[targetUser.id]) {
                store.traderStats[targetUser.id] = {
                    completedTrades: 0,
                    totalVolume: 0,
                    totalEarned: 0,
                    totalSpent: 0,
                    totalStars: 0,
                    starCount: 0,
                    mcName: null
                };
            }

            // 4. MC NAME SPEICHERN
            const oldMcName = store.traderStats[targetUser.id].mcName;
            store.traderStats[targetUser.id].mcName = mcName;
            store.save();

            // 5. ERFOLG — PURE CV2
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ✅ MC-Name verknüpft\n\n` +
                        `**Discord:** <@${targetUser.id}>\n` +
                        `**MC Name:** \`${mcName}\``
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        oldMcName
                            ? `~~Vorher: \`${oldMcName}\`~~ → **Jetzt: \`${mcName}\`**`
                            : `→ Neu verknüpft!`
                    )
                );

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            console.log(`✅ MC-Name gesetzt: ${targetUser.tag} → ${mcName}`);

        } catch (error) {
            console.error('Error in /set-mcname:', error);
            try {
                await interaction.editReply({ content: '❌ Fehler beim Speichern des MC-Namens.' });
            } catch (e) {}
        }
    }
};