const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

module.exports = function buildTradeContainer(data) {
    let statusText;

    if (data.cancelled) {
        statusText = `❌ **Trade abgebrochen!**`;
    } else if (data.closed) {
        statusText = `✅ **Trade abgeschlossen!**`;
    } else if (data.claimedBy) {
        statusText = `🔒 Geclaimt von <@${data.claimedBy}>`;
    } else {
        statusText = `🔓 Noch nicht geclaimt!`;
    }

    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${data.emoji} • Spawner ${data.action}\n\n` +
                `**🤝 • Handel #${data.handNummer}**`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**👤 Kunde:** <@${data.kundeId}>\n` +
                `**🎮 ING:** \`${data.ingameName}\`\n` +
                `**${data.spawnerEmoji} Spawner:** ${data.spawnerType}\n`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**📦 Menge:** ${data.amount}\n` +
                `**💵 Preis/Stk:** ${data.pricePerUnit.toFixed(1)}M\n` +
                `**💰 Gesamtpreis:** ${data.totalPrice.toFixed(1)}M`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(statusText)
        );
};