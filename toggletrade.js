const { SlashCommandBuilder } = require('discord.js');
const constants = require('../../config/constants');
const store = require('../../data/store');
const hugoguardApi = require('../../utils/hugoguardApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggletrade')
        .setDescription('⏸️ Ankauf/Verkauf stoppen oder freigeben (Trader Admin)')
        .addStringOption(opt =>
            opt.setName('spawner')
                .setDescription('Welcher Spawner?')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(constants.prices).map(name => ({
                        name: `${constants.spawnerEmojis[name] || '📦'} ${name}`,
                        value: name
                    }))
                )
        )
        .addStringOption(opt =>
            opt.setName('typ')
                .setDescription('Ankauf oder Verkauf?')
                .setRequired(true)
                .addChoices(
                    { name: '🛒 Kaufen', value: 'ankauf' },
                    { name: '💰 Verkauf', value: 'verkauf' }
                )
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: 64 });
        } catch (err) {
            console.log('❌ deferReply fehlgeschlagen:', err.message);
            return;
        }

        if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
            await interaction.editReply({ content: '❌ Nur Trader Admins dürfen Trades stoppen!' });
            return;
        }

        const spawner = interaction.options.getString('spawner');
        const typ = interaction.options.getString('typ');

        const oldValue = store.getPrice(spawner, typ);
        const nextValue = store.getToggledPrice(spawner, typ);

        try {
            await hugoguardApi.updateSpawnerPrice(spawner, typ, nextValue === 'Stop' ? null : nextValue);
        } catch (err) {
            console.error('❌ HugoGuard-Preisupdate fehlgeschlagen:', err.message);
            await interaction.editReply({
                content: `❌ Der Handelsstatus wurde nicht geändert, weil HugoGuard nicht aktualisiert werden konnte.\n${err.message}`
            });
            return;
        }

        const newValue = store.togglePrice(spawner, typ);
        store.recordPriceChange(spawner, typ, oldValue, newValue, interaction.user.id);

        const emoji = constants.spawnerEmojis[spawner] || '📦';
        const typLabel = typ === 'ankauf' ? '🛒 Ankauf' : '💰 Verkauf';
        const oldStatus = oldValue === 'Stop' ? 'GESTOPPT' : `${oldValue.toFixed(1)}M`;
        const newStatus = newValue === 'Stop' ? 'GESTOPPT' : `${newValue.toFixed(1)}M`;

        await interaction.editReply({
            content: `${emoji} ${spawner} — ${typLabel}: ~~${oldStatus}~~ → **${newStatus}**\n\n📊 Panel wird aktualisiert...`
        });

        store.updatePricePanel(interaction.client).catch(err => {
            console.error('Panel update error:', err.message);
        });
    }
};