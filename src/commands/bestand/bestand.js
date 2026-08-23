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
        .setName('bestand')
        .setDescription('📦 Spawner-Bestand verwalten (Trader)')
        .addSubcommand(sub =>
            sub.setName('anzeigen')
                .setDescription('Zeigt den aktuellen Bestand aller Spawner an')
        )
        .addSubcommand(sub =>
            sub.setName('hinzufuegen')
                .setDescription('Spawner zum Bestand hinzufügen')
                .addStringOption(opt =>
                    opt.setName('spawner')
                        .setDescription('Welcher Spawner-Typ?')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(constants.prices).map(name => ({
                                name: `${constants.spawnerEmojis[name] || '📦'} ${name}`,
                                value: name
                            }))
                        )
                )
                .addIntegerOption(opt =>
                    opt.setName('menge')
                        .setDescription('Wie viele Spawner?')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('abziehen')
                .setDescription('Spawner vom Bestand abziehen')
                .addStringOption(opt =>
                    opt.setName('spawner')
                        .setDescription('Welcher Spawner-Typ?')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(constants.prices).map(name => ({
                                name: `${constants.spawnerEmojis[name] || '📦'} ${name}`,
                                value: name
                            }))
                        )
                )
                .addIntegerOption(opt =>
                    opt.setName('menge')
                        .setDescription('Wie viele Spawner abziehen?')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(constants.TRADER_ROLE_ID)) {
            await interaction.reply({ content: '❌ Nur Trader dürfen den Bestand verwalten.', flags: MessageFlags.Ephemeral });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'anzeigen') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const stockLines = Object.keys(constants.prices).map(name => {
                const stock = store.getInventory(name);
                const emoji = constants.spawnerEmojis[name] || '📦';
                const stockStr = stock > 0 ? `**${stock} Stück**` : '_Kein Bestand_';
                return `${emoji} ${name}: ${stockStr}`;
            }).join('\n');

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 📦 • Aktueller Bestand\n\n` +
                        stockLines
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> Bestand aktualisiert sich automatisch bei abgeschlossenen Trades.\n` +
                        `> Manuelle Anpassungen mit \`/bestand hinzufuegen\` oder \`/bestand abziehen\`.`
                    )
                );

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (subcommand === 'hinzufuegen') {
            const spawner = interaction.options.getString('spawner');
            const menge = interaction.options.getInteger('menge');

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            store.adjustInventory(spawner, menge);
            const newStock = store.getInventory(spawner);
            const emoji = constants.spawnerEmojis[spawner] || '📦';

            try {
                await store.updatePricePanel(global.client);
            } catch (err) {
                console.log('⚠️ Panel update fehlgeschlagen:', err.message);
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ✅ Bestand aktualisiert\n\n` +
                        `${emoji} **${spawner}** — **+${menge}** hinzugefügt\n` +
                        `Neuer Bestand: **${newStock} Stück**\n\n` +
                        `||Geändert von <@${interaction.user.id}>||`
                    )
                );

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (subcommand === 'abziehen') {
            const spawner = interaction.options.getString('spawner');
            const menge = interaction.options.getInteger('menge');
            const currentStock = store.getInventory(spawner);

            if (currentStock < menge) {
                await interaction.reply({ content: `❌ Es sind nur **${currentStock}** ${spawner} auf Lager! Du kannst nicht ${menge} abziehen.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            store.adjustInventory(spawner, -menge);
            const newStock = store.getInventory(spawner);
            const emoji = constants.spawnerEmojis[spawner] || '📦';

            try {
                await store.updatePricePanel(global.client);
            } catch (err) {
                console.log('⚠️ Panel update fehlgeschlagen:', err.message);
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ✅ Bestand aktualisiert\n\n` +
                        `${emoji} **${spawner}** — **-${menge}** abgezogen\n` +
                        `Neuer Bestand: **${newStock} Stück**\n\n` +
                        `||Geändert von <@${interaction.user.id}>||`
                    )
                );

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return;
        }
    }
};