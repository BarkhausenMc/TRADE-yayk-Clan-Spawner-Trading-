const { SlashCommandBuilder } = require('discord.js');
const constants = require('../../config/constants');
const store = require('../../data/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setprice')
        .setDescription('⚙️ Preis für Spawner setzen (Trader Admin)')
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
        )
        .addNumberOption(opt =>
            opt.setName('preis')
                .setDescription('Neuer Preis in Millionen (z.B. 12.5)')
                .setRequired(true)
                .setMinValue(0)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: 64 });
        } catch (err) {
            console.log('❌ deferReply fehlgeschlagen:', err.message);
            return;
        }

        if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
            await interaction.editReply({ content: '❌ Nur Trader Admins dürfen Preise setzen!' });
            return;
        }

        const spawner = interaction.options.getString('spawner');
        const typ = interaction.options.getString('typ');
        const preis = interaction.options.getNumber('preis');

        const oldPrice = store.getPrice(spawner, typ);
        store.setPrice(spawner, typ, preis);
        store.recordPriceChange(spawner, typ, oldPrice, preis, interaction.user.id);

        const emoji = constants.spawnerEmojis[spawner] || '📦';
        const typLabel = typ === 'ankauf' ? '🛒 Ankauf' : '💰 Verkauf';
        const oldStr = oldPrice === 'Stop' ? 'GESTOPPT' : `${oldPrice.toFixed(1)}M`;

        await interaction.editReply({
            content: `✅ Preis aktualisiert!\n${emoji} ${spawner} — ${typLabel}: ~~${oldStr}~~ → **${preis.toFixed(1)}M**\n\n📊 Panel wird aktualisiert...`
        });

        store.updatePricePanel(interaction.client).catch(err => {
            console.error('Panel update error:', err.message);
        });
    }
};