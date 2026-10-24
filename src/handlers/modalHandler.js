const {
    ContainerBuilder, TextDisplayBuilder,
    MessageFlags, ChannelType
} = require('discord.js');
const constants = require('../config/constants');
const store = require('../data/store');
const buildTradeContainer = require('../utils/buildTradeContainer');
const buildActionButtonRow = require('../utils/buildActionButtonRow');

module.exports = async function handleModal(interaction) {
    if (!interaction.customId.startsWith('trade_modal:')) return;

    const deferred = await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

    const parts = interaction.customId.split(':');
    const tradeType = parts[1];
    const spawnerType = parts[2];

    const pricePerUnit = store.getPrice(spawnerType, tradeType);
    if (pricePerUnit === 'Stop' || typeof pricePerUnit !== 'number') {
        if (deferred) {
            await interaction.editReply({ content: `❌ Der ${spawnerType} ${tradeType === 'ankauf' ? 'Ankauf' : 'Verkauf'} ist derzeit gestoppt.` }).catch(() => {});
        }
        return;
    }

    const ingameName = interaction.fields.getTextInputValue('ingame_name');
    const amount = interaction.fields.getTextInputValue('amount');
    const parsedAmount = parseInt(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        if (deferred) {
            await interaction.editReply({ content: '❌ Bitte gib eine gültige Anzahl ein!' }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Bitte gib eine gültige Anzahl ein!', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
    }

    store.tradeCounters[interaction.user.id] = (store.tradeCounters[interaction.user.id] || 0) + 1;
    const handNummer = store.tradeCounters[interaction.user.id];
    store.save();

    const emoji = tradeType === 'ankauf' ? '🛒' : '💰';
    const action = tradeType === 'ankauf' ? 'Ankauf' : 'Verkauf';
    const spawnerEmoji = constants.spawnerEmojis[spawnerType] || '❌';
    const totalPrice = pricePerUnit * parsedAmount;

    let thread;
    try {
        thread = await interaction.channel.threads.create({
            name: `${emoji} ${action} - ${spawnerEmoji} ${spawnerType} - 📦 Menge: ${amount} - #${handNummer}`,
            type: ChannelType.PrivateThread,
            invitable: true
        });
    } catch (err) {
        console.error('❌ Fehler beim Thread erstellen:', err.message);
        if (deferred) {
            await interaction.editReply({ content: '❌ Fehler beim Erstellen des Tickets!' }).catch(() => {});
        }
        return;
    }

    await thread.members.add(interaction.user.id).catch(() => {});

    // ⭐ TRADER ZU THREAD HINZUFÜGEN (korrekt gefixt)
    if (constants.TRADER_ROLE_ID) {
        try {
            // Option A: Alle Member fetchen und nach Rolle filtern
            const members = await interaction.guild.members.fetch();
            const traderMembers = members.filter(m => m.roles.cache.has(constants.TRADER_ROLE_ID));
            
            console.log(`📋 ${traderMembers.size} Trader gefunden, füge hinzu...`);
            
            for (const member of traderMembers.values()) {
                try {
                    await thread.members.add(member.id);
                    console.log(`✅ ${member.user.tag} zum Thread hinzugefügt`);
                } catch (err) {
                    console.warn(`⚠️ ${member.user.tag} nicht hinzugefügt: ${err.message}`);
                }
            }
        } catch (err) {
            console.error('❌ Trader-Fetch fehlgeschlagen:', err.message);
        }
    }

    const tradeData = {
        messageId: null, claimedBy: null, closed: false, cancelled: false, closing: false,
        kundeId: interaction.user.id, ingameName, spawnerType, spawnerEmoji,
        amount: parsedAmount, pricePerUnit, totalPrice, handNummer, emoji, action
    };

    const container = buildTradeContainer(tradeData);
    const actionRow = buildActionButtonRow(tradeData);

    const tradeMsg = await thread.send({ components: [container, actionRow], flags: MessageFlags.IsComponentsV2 });

    if (constants.TRADER_ROLE_ID) {
        try {
            await thread.send({ content: `||** <@&${constants.TRADER_ROLE_ID}> — Neuer Trade von \`${ingameName}\`! **||` });
        } catch (err) { console.log('Fehler beim Trader-Ping:', err.message); }
    }

    if (constants.LOG_CHANNEL_ID) {
        try {
            const logContainer = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## ${emoji} • Neuer Handel #${handNummer}\n\n**Status:** ⏳ Offen\n**Zeit:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n**👤 Kunde:** <@${tradeData.kundeId}>\n**🎮 ING:** \`${ingameName}\`\n\n**${spawnerEmoji} Spawner:** ${spawnerType}\n**📦 Menge:** ${parsedAmount}\n**💵 Preis/Stk:** ${pricePerUnit.toFixed(1)}M\n**💰 Gesamtpreis:** ${totalPrice.toFixed(1)}M`
                ));
            const logChannel = interaction.guild.channels.cache.get(constants.LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (err) { console.log('Fehler beim Loggen:', err.message); }
    }

    tradeData.messageId = tradeMsg.id;
    store.trades[String(thread.id)] = tradeData;
    store.save();
    console.log('✅ Trade gespeichert unter ID:', String(thread.id));

    if (deferred) {
        await interaction.editReply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ Dein Trade-Ticket wurde erstellt: <#${thread.id}>`))],
            flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
    }
};