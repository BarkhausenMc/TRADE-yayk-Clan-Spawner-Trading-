const { MessageFlags } = require('discord.js');
const buildTradeContainer = require('./buildTradeContainer');
const buildActionButtonRow = require('./buildActionButtonRow');

module.exports = async function updateTradeMessage(channel, trade) {
    const container = buildTradeContainer(trade);
    const actionRow = buildActionButtonRow(trade);
    const components = actionRow ? [container, actionRow] : [container];

    const msg = await channel.messages.fetch(trade.messageId);
    await msg.edit({
        components,
        flags: MessageFlags.IsComponentsV2
    });
};