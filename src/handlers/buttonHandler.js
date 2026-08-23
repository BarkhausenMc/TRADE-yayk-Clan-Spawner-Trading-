const {
    ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder,
    TextDisplayBuilder, SeparatorBuilder, MessageFlags
} = require('discord.js');
const store = require('../data/store');
const constants = require('../config/constants');
const updateTradeMessage = require('../utils/updateTradeMessage');

const vouchTimeouts = new Map();

function findTrade(channelId) {
    const id = String(channelId);
    if (store.trades[id]) return store.trades[id];
    console.warn(`⚠️ Trade NICHT gefunden für Channel: "${id}"`);
    console.warn(`Verfügbare Keys:`, Object.keys(store.trades));
    return null;
}

async function logTrade(guild, trade, status) {
    const logChannel = guild.channels.cache.get(constants.LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logContainer = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${trade.emoji} • Handel #${trade.handNummer}\n\n**Status:** ${status}\n**Zeit:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n**👤 Kunde:** <@${trade.kundeId}>\n**🎮 ING:** \`${trade.ingameName}\`\n**🤝 Trader:** ${trade.claimedBy ? `<@${trade.claimedBy}>` : 'Nicht geclaimt'}\n\n**${trade.spawnerEmoji} Spawner:** ${trade.spawnerType}\n**📦 Menge:** ${trade.amount}\n**💵 Preis/Stk:** ${trade.pricePerUnit.toFixed(1)}M\n**💰 Gesamtpreis:** ${trade.totalPrice.toFixed(1)}M`
        ));
    await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
}

async function forceCloseVouchWithChannel(channel, trade, guild) {
    try {
        console.log(`🔍 forceCloseVouchWithChannel START | Trade #${trade.handNummer} | Type: ${trade.action} | Spawner: ${trade.spawnerType} | Amount: ${trade.amount}`);

        if (trade.vouchEntries && trade.vouchEntries.length > 0) {
            const vouchChannel = guild.channels.cache.get(constants.VOUCH_CHANNEL_ID);
            if (vouchChannel) {
                let content = `## ${trade.emoji} • Handel #${trade.handNummer}\n\n`;
                content += `**${trade.emoji} Aktion:** ${trade.action}\n**${trade.spawnerEmoji} Spawner:** ${trade.spawnerType}\n**📦 Menge:** ${trade.amount}\n**💰 Gesamtpreis:** ${trade.totalPrice.toFixed(1)}M\n\n**👤 Kunde:** <@${trade.kundeId}>\n**🤝 Trader:** <@${trade.claimedBy}>\n\n`;
                for (const vouch of trade.vouchEntries) {
                    const role = vouch.reviewerId === trade.kundeId ? 'Kunde' : 'Trader';
                    const stars = '⭐'.repeat(vouch.rating);
                    content += `### 📝 Bewertung von ${role}\n${stars} (${vouch.rating}/5)\n> ${vouch.text}\n\n`;
                }
                await vouchChannel.send({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))], flags: MessageFlags.IsComponentsV2 });
            }
        }

        if (trade.claimedBy && store.traderStats) {
            if (!store.traderStats[trade.claimedBy]) {
                store.traderStats[trade.claimedBy] = { completedTrades: 0, totalVolume: 0, totalEarned: 0, totalSpent: 0, totalStars: 0, starCount: 0 };
            }
            const stats = store.traderStats[trade.claimedBy];
            stats.completedTrades += 1;
            stats.totalVolume += trade.totalPrice;
            if (trade.action === 'Ankauf') stats.totalEarned += trade.totalPrice;
            else stats.totalSpent += trade.totalPrice;
            const cv = trade.vouchEntries?.find(v => v.reviewerId === trade.kundeId);
            if (cv) { stats.totalStars += cv.rating; stats.starCount += 1; }
            store.save();
        }

        const inventoryDelta = trade.action === 'Ankauf' ? -trade.amount : trade.amount;
        console.log(`📦 Bestand: ${trade.spawnerType} ${inventoryDelta > 0 ? '+' : ''}${inventoryDelta}`);
        store.adjustInventory(trade.spawnerType, inventoryDelta);
        console.log(`📦 Neuer Wert: ${store.getInventory(trade.spawnerType)}`);

        try { await store.updatePricePanel(global.client); console.log('✅ Panel aktualisiert!'); }
        catch (err) { console.error('❌ Panel update fehlgeschlagen:', err.message); }

        await logTrade(guild, trade, `✅ ABGESCHLOSSEN (${(trade.vouches || []).length}/2 Bewertungen)`);

        await channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('⏳ Dieses Ticket wird in **5 Sekunden** gelöscht...'))], flags: MessageFlags.IsComponentsV2 });

        setTimeout(async () => {
            try {
                await channel.delete();
                delete store.trades[String(channel.id)];
                store.save();
                console.log(`✅ Ticket gelöscht.`);
            } catch (err) { console.error('❌ Delete error:', err.message); }
        }, 5000);
    } catch (err) {
        console.error('❌ Error in forceCloseVouchWithChannel:', err.message);
    }
}

module.exports = async function handleButton(interaction) {
    try {
        // === CLAIM ===
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

        // === FREIGEBEN ===
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

        // === COMPLETE ===
        if (interaction.customId === 'complete') {
            const trade = findTrade(interaction.channelId);
            if (!trade) { await interaction.reply({ content: '❌ Trade nicht gefunden.', flags: MessageFlags.Ephemeral }); return; }
            if (!trade.claimedBy) { await interaction.reply({ content: '❌ Der Trade muss erst geclaimt werden.', flags: MessageFlags.Ephemeral }); return; }
            if (interaction.user.id !== trade.claimedBy) { await interaction.reply({ content: `❌ Nur <@${trade.claimedBy}> darf den Trade abschließen.`, flags: MessageFlags.Ephemeral }); return; }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            trade.awaitingVouch = true;
            trade.vouches = [];
            trade.vouchEntries = [];
            store.save();
            try { await updateTradeMessage(interaction.channel, trade); } catch (e) { console.error('Update msg error:', e.message); }

            const starSelect = new StringSelectMenuBuilder()
                .setCustomId('vouch_stars')
                .setPlaceholder('⭐ Bewerte deinen Trade-Partner (1-5 Sterne)')
                .addOptions([
                    { label: '⭐ 1 Stern', description: 'Sehr schlechte Erfahrung', value: '1', emoji: '⭐' },
                    { label: '⭐⭐ 2 Sterne', description: 'Schlechte Erfahrung', value: '2', emoji: '⭐' },
                    { label: '⭐⭐⭐ 3 Sterne', description: 'Okay', value: '3', emoji: '⭐' },
                    { label: '⭐⭐⭐⭐ 4 Sterne', description: 'Gute Erfahrung', value: '4', emoji: '⭐' },
                    { label: '⭐⭐⭐⭐⭐ 5 Sterne', description: 'Sehr gute Erfahrung', value: '5', emoji: '⭐' }
                ]);

            const vouchContainer = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## 📝 • Trade Bewertung\n\nBitte **bewertet** euch gegenseitig!\nWähle unten deine **Sterne-Bewertung** aus.\n\n**Kunde:** <@${trade.kundeId}>\n**Trader:** <@${trade.claimedBy}>\n\n⏱️ *Das Ticket schließt automatisch in 5 Minuten.*`
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(starSelect));

            await interaction.channel.send({ components: [vouchContainer], flags: MessageFlags.IsComponentsV2 });
            await interaction.editReply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('✅ Trade abgeschlossen — bitte bewertet euch gegenseitig!'))], flags: MessageFlags.IsComponentsV2 });

            const channelId = String(interaction.channelId);
            const guildId = interaction.guild.id;
            const timeout = setTimeout(async () => {
                try {
                    const guild = await interaction.client.guilds.fetch(guildId);
                    const channel = await guild.channels.fetch(channelId);
                    if (!channel) return;
                    const currentTrade = findTrade(channelId);
                    if (!currentTrade || !currentTrade.awaitingVouch) return;
                    await channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('⏰ **5 Minuten vorbei!** Das Ticket wird geschlossen.'))], flags: MessageFlags.IsComponentsV2 });
                    await forceCloseVouchWithChannel(channel, currentTrade, guild);
                } catch (err) { console.error('Vouch-Timeout error:', err.message); }
            }, 5 * 60 * 1000);
            vouchTimeouts.set(channelId, timeout);
            return;
        }

        // === ABBRUCH ===
        if (interaction.customId === 'abbruch') {
            const channelIdStr = String(interaction.channelId);
            const trade = findTrade(channelIdStr);
            if (!trade) { await interaction.reply({ content: '❌ Trade nicht gefunden oder bereits geschlossen.', flags: MessageFlags.Ephemeral }); return; }

            const timeout = vouchTimeouts.get(channelIdStr);
            if (timeout) { clearTimeout(timeout); vouchTimeouts.delete(channelIdStr); }

            trade.cancelled = true;
            store.save();
            await interaction.deferUpdate();
            try { await updateTradeMessage(interaction.channel, trade); } catch (e) { console.error('Update msg error:', e.message); }

            await interaction.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Trade abgebrochen\n\nDer Handel #${trade.handNummer} wurde von <@${interaction.user.id}> abgebrochen.\nDas Ticket wird in **5 Sekunden** gelöscht...`))], flags: MessageFlags.IsComponentsV2 });
            await interaction.followUp({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('✅ Deine Anfrage wurde verarbeitet.'))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const guild = interaction.guild;
            setTimeout(async () => {
                try { await logTrade(guild, trade, '❌ ABGEBROCHEN'); await interaction.channel.delete(); delete store.trades[channelIdStr]; store.save(); }
                catch (err) { console.error('Delete error:', err.message); }
            }, 5000);
            return;
        }

        // === SPAWNER ANKAUF / VERKAUF ===
        if (interaction.customId === 'spawner_ankaufen' || interaction.customId === 'spawner_verkaufen') {
            const isAnkauf = interaction.customId === 'spawner_ankaufen';
            const priceKey = isAnkauf ? 'ankauf' : 'verkauf';
            const title = isAnkauf ? '🛒 • Spawner Ankauf' : '💰 • Spawner Verkauf';
            const desc = isAnkauf ? 'kaufen' : 'verkaufen';

            const options = Object.entries(constants.prices).map(([name, prices]) => {
                const stopped = prices[priceKey] === 'Stop' || prices[priceKey] === undefined;
                return { label: `${name} Spawner`, description: stopped ? '⚠️ Derzeit GESTOPT' : `Preis: ${prices[priceKey].toFixed(1)}M`, value: name, emoji: constants.spawnerEmojis[name] || '📦' };
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

module.exports.vouchTimeouts = vouchTimeouts;
module.exports.findTrade = findTrade;
module.exports.forceCloseVouchWithChannel = forceCloseVouchWithChannel;
module.exports.logTrade = logTrade;