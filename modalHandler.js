const {
    ContainerBuilder, TextDisplayBuilder,
    MessageFlags, ChannelType, PermissionFlagsBits
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

    const requiredBotPermissions = [
        [PermissionFlagsBits.ViewChannel, 'Kanal ansehen'],
        [PermissionFlagsBits.CreatePrivateThreads, 'Private Threads erstellen'],
        [PermissionFlagsBits.ManageThreads, 'Threads verwalten'],
        [PermissionFlagsBits.SendMessagesInThreads, 'In Threads schreiben']
    ];
    const missingBotPermissions = requiredBotPermissions
        .filter(([permission]) => !interaction.appPermissions?.has(permission))
        .map(([, name]) => name);

    if (missingBotPermissions.length) {
        console.error(`❌ Bot-Rechte im Panel-Kanal fehlen: ${missingBotPermissions.join(', ')}`);
        if (deferred) {
            await interaction.editReply({
                content: `❌ Der Bot kann das Ticket nicht erstellen. Im Panel-Kanal fehlen ihm diese Rechte: ${missingBotPermissions.join(', ')}.`
            }).catch(() => {});
        }
        return;
    }

    const requiredMemberPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessagesInThreads
    ];
    if (!interaction.memberPermissions?.has(requiredMemberPermissions)) {
        console.error(`❌ Thread-Rechte fehlen für den Ticket-Ersteller ${interaction.user.tag}.`);
        if (deferred) {
            await interaction.editReply({
                content: '❌ Du kannst in diesem Ticket nicht schreiben. Bitte lass im Panel-Kanal für deine Rolle „Kanal ansehen“ und „In Threads schreiben“ erlauben.'
            }).catch(() => {});
        }
        return;
    }

    if (!constants.TRADER_ROLE_ID) {
        console.error('❌ TRADER_ROLE_ID ist nicht konfiguriert; Ticket wird nicht erstellt.');
        if (deferred) {
            await interaction.editReply({ content: '❌ Die Trader-Rolle ist nicht konfiguriert. Bitte informiere einen Administrator.' }).catch(() => {});
        }
        return;
    }

    let traderMembers;
    try {
        const members = await interaction.guild.members.fetch();
        traderMembers = members.filter(member => member.roles.cache.has(constants.TRADER_ROLE_ID));
    } catch (err) {
        console.error('❌ Trader-Fetch fehlgeschlagen:', err.message);
        if (deferred) {
            await interaction.editReply({ content: '❌ Die Trader konnten nicht geladen werden. Bitte informiere einen Administrator.' }).catch(() => {});
        }
        return;
    }

    if (traderMembers.size === 0) {
        console.error(`❌ Keine Mitglieder mit Trader-Rolle ${constants.TRADER_ROLE_ID} gefunden.`);
        if (deferred) {
            await interaction.editReply({ content: '❌ Es wurden keine Mitglieder mit der Trader-Rolle gefunden. Bitte informiere einen Administrator.' }).catch(() => {});
        }
        return;
    }

    const tradersWithoutAccess = traderMembers.filter(member => {
        const permissions = interaction.channel.permissionsFor(member);
        return !permissions?.has(requiredMemberPermissions);
    });

    if (tradersWithoutAccess.size > 0) {
        const names = [...tradersWithoutAccess.values()].map(member => member.user.tag);
        console.error(`❌ Trader können im Panel-Kanal nicht schreiben: ${names.join(', ')}`);
        if (deferred) {
            await interaction.editReply({
                content: `❌ Für ${tradersWithoutAccess.size} Trader fehlen im Panel-Kanal die Rechte „Kanal ansehen“ und/oder „In Threads schreiben“. Bitte lass die Kanalrechte für die Trader-Rolle prüfen.`
            }).catch(() => {});
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

    console.log(`📋 ${traderMembers.size} Trader gefunden, füge hinzu...`);
    const membersToAdd = new Map([[interaction.user.id, interaction.user.tag]]);
    for (const member of traderMembers.values()) {
        membersToAdd.set(member.id, member.user.tag);
    }

    const failedAdds = [];
    for (const [memberId, tag] of membersToAdd) {
        try {
            await thread.members.add(memberId);
            console.log(`✅ ${tag} zum Thread hinzugefügt`);
        } catch (err) {
            console.warn(`⚠️ ${tag} nicht hinzugefügt: ${err.message}`);
            failedAdds.push(tag);
        }
    }

    if (failedAdds.length > 0) {
        console.error(`❌ Ticket abgebrochen; ${failedAdds.length} Mitglied(er) konnten nicht hinzugefügt werden.`);
        try {
            await thread.delete();
        } catch (err) {
            console.error('❌ Unvollständigen Thread konnte nicht gelöscht werden:', err.message);
        }
        if (deferred) {
            await interaction.editReply({
                content: `❌ Das Ticket wurde nicht erstellt, weil ${failedAdds.length} Mitglied(er) nicht hinzugefügt werden konnten. Bitte prüfe die Bot-Rechte und die Fehlermeldungen in der Bot-Konsole.`
            }).catch(() => {});
        }
        return;
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