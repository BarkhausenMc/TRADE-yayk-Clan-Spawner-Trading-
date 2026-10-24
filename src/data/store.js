const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const constants = require('../config/constants');

const DATA_FILE = path.join(__dirname, '../../data/database.json');

let data = {
    tradeCounters: {},
    trades: {},
    priceChanges: [],
    lastAnnounceMessageId: null
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
        if (!data.tradeCounters) data.tradeCounters = {};
        if (!data.trades) data.trades = {};
        if (!data.priceChanges) data.priceChanges = [];
        if (data.lastAnnounceMessageId === undefined) data.lastAnnounceMessageId = null;

        delete data.inventory;
        delete data.traderStats;
        delete data.vouches;
        delete data.lastTraderListMessageId;

        console.log('✅ Datenbank geladen:', Object.keys(data.trades).length, 'aktive Trades');
    } catch (err) {
        console.error('❌ Fehler beim Laden:', err);
        data = { tradeCounters: {}, trades: {}, priceChanges: [], lastAnnounceMessageId: null };
    }
}

function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) { console.error('❌ Fehler beim Speichern:', err); }
}

function getPrice(name, type) {
    if (data.prices && data.prices[name] && data.prices[name][type] !== undefined) return data.prices[name][type];
    return constants.prices[name]?.[type] || 0;
}

function setPrice(name, type, value) {
    if (!data.prices) data.prices = {};
    if (!data.prices[name]) data.prices[name] = {};
    data.prices[name][type] = value;
    if (constants.prices[name]) constants.prices[name][type] = value;
    saveData();
}

function togglePrice(name, type) {
    if (!data.prices) data.prices = {};
    if (!data.prices[name]) data.prices[name] = {};
    const current = data.prices[name][type];
    if (current === 'Stop') {
        const def = constants.prices[name]?.[type] || 0;
        data.prices[name][type] = def;
        if (constants.prices[name]) constants.prices[name][type] = def;
    } else {
        data.prices[name][type] = 'Stop';
        if (constants.prices[name]) constants.prices[name][type] = 'Stop';
    }
    saveData();
    return data.prices[name][type];
}

function recordPriceChange(name, type, oldVal, newVal, userId) {
    data.priceChanges.push({ spawner: name, type, oldValue: oldVal, newValue: newVal, userId, timestamp: Date.now() });
    if (data.priceChanges.length > 50) data.priceChanges = data.priceChanges.slice(-50);
    saveData();
}

function getRecentPriceChanges(minutes) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return data.priceChanges.filter(c => c.timestamp >= cutoff);
}

function getPanelMessageId() { return data.panelMessageId || null; }
function setPanelMessageId(id) { data.panelMessageId = id; saveData(); }
function getPanelChannelId() { return data.panelChannelId || null; }
function setPanelChannelId(id) { data.panelChannelId = id; saveData(); }
function getLastAnnounceMessageId() { return data.lastAnnounceMessageId || null; }
function setLastAnnounceMessageId(id) { data.lastAnnounceMessageId = id; saveData(); }

function buildPricePanel() {
    const priceLines = Object.entries(constants.prices).map(([name]) => {
        const a = getPrice(name, 'ankauf');
        const v = getPrice(name, 'verkauf');
        const ankauf = a === 'Stop' ? 'STOP' : `${a.toFixed(1)}M`;
        const verkauf = v === 'Stop' ? 'STOP' : `${v.toFixed(1)}M`;
        const emoji = constants.spawnerEmojis[name] || '📦';
        return `${emoji} ${name.padEnd(12)} ${ankauf.padStart(10)}  ${verkauf.padStart(10)}`;
    }).join('\n');

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## :shopping_cart: • SPAWNER TRADING • :moneybag:\n*TRADE (yayk Clan Spawner Trading)*\n||*Only Trusted Trader, Faire Preise :purple_heart:*||'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('```\nSPAWNER      🛒ANKAUF    💰VERKAUF\n────────────────────────────────────\n' + priceLines + '\n```'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('💰 **VERKAUFEN** — Du **verkaufst** uns deine Spawner'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🛒 **ANKAUF** — Du **kaufst** unsere Spawner'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Klicke unten auf den `💰 VERKAUFEN` oder `🛒 ANKAUF` Button,\num einen Trade zu Starten.'));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spawner_ankaufen').setLabel('Spawner Kaufen').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('spawner_verkaufen').setLabel('Spawner Verkaufen').setStyle(ButtonStyle.Success).setEmoji('💰')
    );
    return [container, row];
}

async function updatePricePanel(client) {
    const messageId = getPanelMessageId();
    const channelId = getPanelChannelId();

    if (!messageId || !channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;

        const msg = await channel.messages.fetch(messageId);
        const components = buildPricePanel();
        await msg.edit({ components, flags: MessageFlags.IsComponentsV2 });
        console.log('✅ Price Panel auto-updated!');
    } catch (err) {
        console.log('⚠️ Panel nicht gefunden, erstelle neues...');
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const components = buildPricePanel();
                const newMsg = await channel.send({ components, flags: MessageFlags.IsComponentsV2 });
                setPanelMessageId(newMsg.id);
                console.log('✅ Neues Panel erstellt!');
            }
        } catch (err2) {
            console.error('❌ Panel konnte nicht neu erstellt werden:', err2.message);
        }
    }
}

loadData();

module.exports = {
    get tradeCounters() { return data.tradeCounters; },
    get trades() { return data.trades; },
    save: saveData, reload: loadData,
    getPrice, setPrice, togglePrice, recordPriceChange, getRecentPriceChanges,
    getPanelMessageId, setPanelMessageId, getPanelChannelId, setPanelChannelId,
    getLastAnnounceMessageId, setLastAnnounceMessageId,
    buildPricePanel, updatePricePanel
};