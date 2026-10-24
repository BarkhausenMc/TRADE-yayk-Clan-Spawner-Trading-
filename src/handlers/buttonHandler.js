const {
    ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder,
    TextDisplayBuilder, MessageFlags
} = require('discord.js');
const store = require('../data/store');
const constants = require('../config/constants');
const updateTradeMessage = require('../utils/updateTradeMessage');

function findTrade(channelId) {
    const id = String(channelId);
    if (store.trades[id]) return store.trades[id];
    console.warn(`⚠️ Trade NICHT gefunden für Channel: "${id}"`);
    return null;
}

async function logTrade(guild, trade, status) {
    const logChannel = guild.channels.cache.get(constants.LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logContainer = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${trade.emoji} • Handel #${trade.handNummer}\n\n**Status:** ${status}\n**Zeit:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n**👤 Kunde:** <@${trade.kundeId}>\n**🎮 ING:** \`${trade.ingameName}\`\n**🤝 Trader:** ${trade.claimedBy ? `<@${trade.claimedBy}>` : 'Nicht geclaimt'}\n\n**${trade.spawnerEmoji} Spawner:** ${trade.spawnerType}\n**📦 Menge:** ${trade.amount}\n**💵 Preis/Stk:** ${trade.pricePerUnit.toFixed(1)}M\n**💰 Gesamtpreis:** ${trade.totalPrice.toFixed(1)}M`
        ));
    await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

async function closeTrade(channel, trade, guild, status) {
    if (trade.closing) return;
    trade.closing = true;
    trade.closed = true;
    store.save();

    await logTrade(guild, trade, status);

    await channel.send({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('⏳ Dieses Ticket wird in **5 Sekunden** geschlossen...'))],
        flags: MessageFlags.IsComponentsV2
    }).catch(() => {});

    const channelId = String(channel.id);
    setTimeout(async () => {
        try {
            await channel.delete();
            delete store.trades[channelId];
            store.save();
        } catch (err) {
            console.log('Fehler beim Löschen:', err.message);
        }
    }, 5000);
}

module.exports = async function handleButton(interaction) {
    try {
        if (interaction.customId === 'claim') {
            const trade = findTrade(interaction.channelId);
            if (!trade) { await interaction.reply({ content: '❌ Trade nicht gefunden.', flags: MessageFlags.Ephemeral }); return; }
            if (trade.claimedBy) { await interaction.reply({ content: `❌ Bereits von <@${trade.claimedBy}> geclaimt.`, flags: MessageFlags.Ephemeral }); return; }
            if (!interaction.member.roles.cache.has(constants.TRADER_ROLE_ID)) { await interaction.reply({ content: '❌ Nur Trader dürfen Trades claimen.', flags: MessageFlags.Ephemeral }); return; }

            trade.claimedBy = interaction.user.id;
            store.save();
            try { await updateTradeMessage(interaction.channel, trade); } catch (e) { console.error('Update msg error:', e.message); }

            await interaction.reply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Trade geclaimt\n\n<@${interaction.user.id}> hat den Handel #${trade.handNummer} übernommen.`))], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (interaction.customId === 'freigeben') {
            const trade = findTrade(interaction.channelId);
            if (!trade || !trade.claimedBy) { await interaction.reply({ content: '❌ Trade ist nicht geclaimt.', flags: MessageFlags.Ephemeral }); return; }
            if (interaction.user.id !== trade.claimedBy) { await interaction.reply({ content: `❌ Nur <@${trade.claimedBy}> kann den Trade freigeben.`, flags: MessageFlags.Ephemeral }); return; }

            trade.claimedBy = null;
            store.save();
            try { await updateTradeMessage(interaction.channel, trade); } catch (e) { console.error('Update msg error:', e.message); }

            await interaction.reply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔓 Trade freigegeben\n\n<@${interaction.user.id}> hat den Handel #${trade.handNummer} wieder freigegeben.`))], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (interaction.customId === 'complete') {
            const trade = findTrade(interaction.channelId);
            if (!trade) { await interaction.reply({ content: '❌ Trade nicht gefunden.', flags: MessageFlags.Ephemeral }); return; }
            if (!trade.claimedBy) { await interaction.reply({ content: '❌ Der Trade muss erst geclaimt werden.', flags: MessageFlags.Ephemeral }); return; }
            if (interaction.user.id !== trade.claimedBy) { await interaction.reply({ content: `❌ Nur <@${trade.claimedBy}> darf den Trade abschließen.`, flags: MessageFlags.Ephemeral }); return; }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply({
                components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Trade abgeschlossen\n\n<@${interaction.user.id}> hat den Handel #${trade.handNummer} als **angekauft** markiert.`))],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => {});

            await closeTrade(interaction.channel, trade, interaction.guild, '✅ ABGESCHLOSSEN');
            return;
        }

        if (interaction.customId === 'abbruch') {
            const channelIdStr = String(interaction.channelId);
            const trade = findTrade(channelIdStr);
            if (!trade) { await interaction.reply({ content: '❌ Trade nicht gefunden oder bereits geschlossen.', flags: MessageFlags.Ephemeral }); return; }

            trade.cancelled = true;
            trade.closing = true;
            trade.closed = true;
            store.save();

            await interaction.deferUpdate();
            try { await updateTradeMessage(interaction.channel, trade); } catch (e) { console.error('Update msg error:', e.message); }

            await interaction.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Trade abgebrochen\n\nDer Handel #${trade.handNummer} wurde von <@${interaction.user.id}> abgebrochen.\nDas Ticket wird in **5 Sekunden** gelöscht...`))], flags: MessageFlags.IsComponentsV2 });
            await interaction.followUp({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('✅ Deine Anfrage wurde verarbeitet.'))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const guild = interaction.guild;
            setTimeout(async () => {
                try {
                    await logTrade(guild, trade, '❌ ABGEBROCHEN');
                    await interaction.channel.delete();
                    delete store.trades[channelIdStr];
                    store.save();
                } catch (err) { console.error('Delete error:', err.message); }
            }, 5000);
            return;
        }

        if (interaction.customId === 'spawner_ankaufen' || interaction.customId === 'spawner_verkaufen') {
            const isAnkauf = interaction.customId === 'spawner_ankaufen';
            const priceKey = isAnkauf ? 'ankauf' : 'verkauf';
            const title = isAnkauf ? '🛒 • Spawner Ankauf' : '💰 • Spawner Verkauf';
            const desc = isAnkauf ? 'kaufen' : 'verkaufen';

            const options = Object.keys(constants.prices).map((name) => {
                const price = store.getPrice(name, priceKey);
                const stopped = price === 'Stop' || typeof price !== 'number';
                return {
                    label: `${name} Spawner`,
                    description: stopped ? '⚠️ Derzeit GESTOPPT' : `Preis: ${price.toFixed(1)}M`,
                    value: name,
                    emoji: constants.spawnerEmojis[name] || '📦'
                };
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\nWähle unten den Spawner, den du **${desc}** möchtest.`))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`select_spawner:${priceKey}`).setPlaceholder('Spawner auswählen...').addOptions(options)
                ));

            await interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
            return;
        }

    } catch (error) {
        console.error('Fehler bei Button Interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            try { await interaction.reply({ content: '❌ Ein Fehler ist aufgetreten.', flags: MessageFlags.Ephemeral }); } catch (_) {}
        }
    }
};

module.exports.findTrade = findTrade;
module.exports.closeTrade = closeTrade;
module.exports.logTrade = logTrade;