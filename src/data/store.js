const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const constants = require('../config/constants');

const DATA_FILE = path.join(__dirname, '../../data/database.json');

let data = {
    tradeCounters: {}, trades: {}, vouches: [], traderStats: {},
    priceChanges: [], inventory: {}, lastAnnounceMessageId: null
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
        if (!data.tradeCounters) data.tradeCounters = {};
        if (!data.trades) data.trades = {};
        if (!data.vouches) data.vouches = [];
        if (!data.traderStats) data.traderStats = {};
        if (!data.priceChanges) data.priceChanges = [];
        if (!data.inventory) data.inventory = {};
        if (data.lastAnnounceMessageId === undefined) data.lastAnnounceMessageId = null;
        for (const name of Object.keys(constants.prices)) {
            if (data.inventory[name] === undefined) data.inventory[name] = 0;
        }
        console.log('✅ Datenbank geladen:', Object.keys(data.trades).length, 'aktive Trades');
        console.log('📊 Trader-Stats:', Object.keys(data.traderStats).length, 'Trader erfasst');
        console.log('📦 Bestand:', JSON.stringify(data.inventory));
    } catch (err) {
        console.error('❌ Fehler beim Laden:', err);
        data = { tradeCounters: {}, trades: {}, vouches: [], traderStats: {}, priceChanges: [], inventory: {}, lastAnnounceMessageId: null };
    }
    if (data.lastTraderListMessageId === undefined) data.lastTraderListMessageId = null;
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

function getInventory(name) { return data.inventory[name] || 0; }

function adjustInventory(name, amount) {
    if (!data.inventory) data.inventory = {};
    if (data.inventory[name] === undefined) data.inventory[name] = 0;
    data.inventory[name] += amount;
    if (data.inventory[name] < 0) data.inventory[name] = 0;
    saveData();
}

function getAllInventory() { return data.inventory || {}; }
function getPanelMessageId() { return data.panelMessageId || null; }
function setPanelMessageId(id) { data.panelMessageId = id; saveData(); }
function getPanelChannelId() { return data.panelChannelId || null; }
function setPanelChannelId(id) { data.panelChannelId = id; saveData(); }
function getLastAnnounceMessageId() { return data.lastAnnounceMessageId || null; }
function setLastAnnounceMessageId(id) { data.lastAnnounceMessageId = id; saveData(); }
function getLastTraderListMessageId() { return data.lastTraderListMessageId || null; }
function setLastTraderListMessageId(messageId) { data.lastTraderListMessageId = messageId; saveData(); }

function buildPricePanel() {
    const priceLines = Object.entries(constants.prices).map(([name]) => {
        const a = getPrice(name, 'ankauf');
        const v = getPrice(name, 'verkauf');
        const ankauf = a === 'Stop' ? 'STOP' : `${a.toFixed(1)}M`;
        const verkauf = v === 'Stop' ? 'STOP' : `${v.toFixed(1)}M`;
        const emoji = constants.spawnerEmojis[name] || '📦';
        return `${emoji} ${name.padEnd(12)} ${ankauf.padStart(10)}  ${verkauf.padStart(10)}`;
    }).join('\n');

    const stockLines = Object.entries(constants.prices).map(([name]) => {
        const stock = getInventory(name);
        const emoji = constants.spawnerEmojis[name] || '📦';
        return `${emoji} ${name}: \`${stock}\` Stück`;
    }).join('\n');

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## :shopping_cart: • SPAWNER TRADING • :moneybag:\n*Yayks Spawner Trading*\n||*Only Trusted Trader, Faire Preise :purple_heart:*||'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('```\nSPAWNER      🛒ANKAUF    💰VERKAUF\n────────────────────────────────────\n' + priceLines + '\n```'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📦 • AKTUELLER BESTAND\n${stockLines}`))
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
        // Wenn Message nicht gefunden -> Neues Panel erstellen
        console.log('⚠️ Panel nicht gefunden, erstelle neues...');
        const channel = await client.channels.fetch(channelId);
        if (channel) {
            const components = buildPricePanel();
            const newMsg = await channel.send({ components, flags: MessageFlags.IsComponentsV2 });
            store.setPanelMessageId(newMsg.id);
            console.log('✅ Neues Panel erstellt!');
        }
    }
}

loadData();

module.exports = {
    get tradeCounters() { return data.tradeCounters; },
    get trades() { return data.trades; },
    get vouches() { return data.vouches; },
    get traderStats() { return data.traderStats; },
    get inventory() { return data.inventory; },
    save: saveData, reload: loadData,
    getPrice, setPrice, togglePrice, recordPriceChange, getRecentPriceChanges,
    getPanelMessageId, setPanelMessageId, getPanelChannelId, setPanelChannelId,
    getLastAnnounceMessageId, setLastAnnounceMessageId,
    buildPricePanel, updatePricePanel,
    getInventory, adjustInventory, getAllInventory,
    getLastTraderListMessageId,
    setLastTraderListMessageId,
};