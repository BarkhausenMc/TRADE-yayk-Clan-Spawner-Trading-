const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = function buildActionButtonRow(data) {
    if (data.closed || data.cancelled) return null;

    if (data.claimedBy) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('complete').setLabel('Als angekauft markieren').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('freigeben').setLabel('Freigeben').setStyle(ButtonStyle.Primary).setEmoji('🔓'),
            new ButtonBuilder().setCustomId('abbruch').setLabel('Abbrechen').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        );
    } else {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
            new ButtonBuilder().setCustomId('abbruch').setLabel('Abbrechen').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        );
    }
};