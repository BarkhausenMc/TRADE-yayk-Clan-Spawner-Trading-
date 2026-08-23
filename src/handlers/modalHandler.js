const {
    ActionRowBuilder, ContainerBuilder, TextDisplayBuilder,
    MessageFlags, ChannelType
} = require('discord.js');
const constants = require('../config/constants');
const store = require('../data/store');
const buildTradeContainer = require('../utils/buildTradeContainer');
const buildActionButtonRow = require('../utils/buildActionButtonRow');

module.exports = async function handleModal(interaction) {

    // === VOUCH MODAL ===
    if (interaction.customId.startsWith('vouch_modal:')) {
        const trade = store.trades[String(interaction.channel.id)];
        if (!trade) {
            await interaction.reply({ content: '❌ Trade nicht gefunden.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferUpdate();

        const rating = parseInt(interaction.customId.split(':')[1]);
        const text = interaction.fields.getTextInputValue('vouch_text') || 'Keine Bewertung geschrieben.';

        trade.vouchEntries = trade.vouchEntries || [];
        trade.vouchEntries.push({ reviewerId: interaction.user.id, rating, text, timestamp: Date.now() });
        store.save();

        console.log(`📝 Vouch erhalten von ${interaction.user.id}: ${rating} Sterne — Trade #${trade.handNummer}`);

        const customerVouch = trade.vouchEntries.find(v => v.reviewerId === trade.kundeId);
        const traderVouch = trade.vouchEntries.find(v => v.reviewerId === trade.claimedBy);

        if (customerVouch && traderVouch) {
            console.log(`✅ Beide Vouches erhalten! Schließe Trade #${trade.handNummer}...`);
            const thankContainer = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## ✅ Beide Bewertungen erhalten!\n\nDanke an beide Parteien.\nDas Ticket wird jetzt geschlossen.`
                ));
            await interaction.channel.send({ components: [thankContainer], flags: MessageFlags.IsComponentsV2 });

            const buttonHandler = require('./buttonHandler');
            await buttonHandler.forceCloseVouchWithChannel(interaction.channel, trade, interaction.guild);
        } else {
            const remainingRole = !customerVouch ? 'Kunde' : 'Trader';
            const waitContainer = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## ✅ Bewertung erhalten\n\nDanke für deine **${rating}-Sterne** Bewertung!\nWarte noch auf die Bewertung vom **${remainingRole}**...\n\n⏱️ *Ticket schließt automatisch in 5 Minuten.*`
                ));
            await interaction.channel.send({ components: [waitContainer], flags: MessageFlags.IsComponentsV2 });
        }
        return;
    }

    // === TRADE MODAL ===
    if (!interaction.customId.startsWith('trade_modal:')) return;

    const parts = interaction.customId.split(':');
    const tradeType = parts[1];
    const spawnerType = parts[2];

    const ingameName = interaction.fields.getTextInputValue('ingame_name');
    const amount = interaction.fields.getTextInputValue('amount');
    const parsedAmount = parseInt(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        await interaction.reply({ content: '❌ Bitte gib eine gültige Anzahl ein (z.B. 3)!', flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    store.tradeCounters[interaction.user.id] = (store.tradeCounters[interaction.user.id] || 0) + 1;
    const handNummer = store.tradeCounters[interaction.user.id];
    store.save();

    const emoji = tradeType === 'ankauf' ? '🛒' : '💰';
    const action = tradeType === 'ankauf' ? 'Ankauf' : 'Verkauf';
    const spawnerEmoji = constants.spawnerEmojis[spawnerType] || '❌';
    const pricePerUnit = constants.prices[spawnerType][tradeType];
    const totalPrice = pricePerUnit * parsedAmount;

    const thread = await interaction.channel.threads.create({
        name: `${emoji} ${action} - ${spawnerEmoji} ${spawnerType} - 📦 Menge: ${amount} - #${handNummer}`,
        type: ChannelType.PrivateThread, invitable: false
    });

    await thread.members.add(interaction.user.id);

    if (constants.TRADER_ROLE_ID) {
        try {
            const role = await interaction.guild.roles.fetch(constants.TRADER_ROLE_ID);
            if (role) {
                for (const member of role.members.values()) {
                    await thread.members.add(member.id).catch(() => {});
                }
            }
        } catch (err) { console.log('Fehler beim Hinzufügen von Tradern:', err.message); }
    }

    const tradeData = {
        messageId: null, claimedBy: null, closed: false, cancelled: false,
        awaitingVouch: false, vouches: [], vouchEntries: [],
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

    await interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ Dein Trade-Ticket wurde erstellt: <#${thread.id}>`))],
        flags: MessageFlags.IsComponentsV2
    });
};