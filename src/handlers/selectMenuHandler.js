const {
    ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, ContainerBuilder, TextDisplayBuilder
} = require('discord.js');
const constants = require('../config/constants');
const store = require('../data/store');

module.exports = async function handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith('select_spawner:')) return;

    const tradeType = interaction.customId.split(':')[1];
    const spawnerType = interaction.values[0];

    const price = store.getPrice(spawnerType, tradeType);
    const isStopped = price === 'Stop' || typeof price !== 'number';

    if (isStopped) {
        const actionLabel = tradeType === 'ankauf' ? 'ANKAUF' : 'VERKAUF';
        const errorContainer = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `## ❌ • ${spawnerType} ${actionLabel} derzeit nicht verfügbar\n\n` +
                `Der **${spawnerType}** Spawner ${actionLabel.toLowerCase()} ist aktuell **gestoppt**.\n` +
                `Du bekommst ein **Ping**, wenn sich etwas bei unsere **Preise/An- und Verkauf** ändert.\n` +
                '||** ℹ️ Du bekommst den Ping nur, wenn du die `Spawner Price` Rolle hast. **||'
            ));
        await interaction.update({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    const actionWord = tradeType === 'ankauf' ? 'Ankauf' : 'Verkauf';
    const emoji = tradeType === 'ankauf' ? '🛒' : '💰';

    const modal = new ModalBuilder()
        .setCustomId(`trade_modal:${tradeType}:${spawnerType}`)
        .setTitle(`${emoji} ${spawnerType} ${actionWord}`);

    const ingameNameInput = new TextInputBuilder()
        .setCustomId('ingame_name').setLabel('Wie lautet dein Ingame-Name?')
        .setStyle(TextInputStyle.Short).setPlaceholder('z.B. Steve').setRequired(true);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(tradeType === 'ankauf' ? 'Wie viele Spawner möchtest du kaufen?' : 'Wie viele Spawner möchtest du verkaufen?')
        .setStyle(TextInputStyle.Short).setPlaceholder('z.B. 3').setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(ingameNameInput),
        new ActionRowBuilder().addComponents(amountInput)
    );
    await interaction.showModal(modal);
};