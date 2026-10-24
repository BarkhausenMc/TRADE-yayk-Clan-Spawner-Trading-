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
    prices: {},
    priceChanges: [],
    lastAnnounceMessageId: null
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const dbData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            // Merge mit existing Struktur
            if (dbData.tradeCounters) data.tradeCounters = dbData.tradeCounters;
            if (dbData.trades) data.trades = dbData.trades;
            if (dbData.prices) data.prices = dbData.prices;
            if (dbData.priceChanges) data.priceChanges = dbData.priceChanges.slice(-50);
            if (dbData.lastAnnounceMessageId !== undefined) data.lastAnnounceMessageId = dbData.lastAnnounceMessageId;
        }

        // Init leere Arrays/Objekte
        if (!data.tradeCounters) data.tradeCounters = {};
        if (!data.trades) data.trades = {};
        if (!data.prices) data.prices = {};
        if (!data.priceChanges) data.priceChanges = [];
        if (data.lastAnnounceMessageId === undefined) data.lastAnnounceMessageId = null;

        // ⭐ Prices vom DB in constants syncken
        syncPricesToConstants();

        console.log('✅ Datenbank geladen:', Object.keys(data.trades).length, 'aktive Trades');
        console.log('📊 Gescrpte Preise:', Object.keys(data.prices).length, 'Spawner-Überschreibungen');
    } catch (err) {
        console.error('❌ Fehler beim Laden:', err);
        data = { tradeCounters: {}, trades: {}, prices: {}, priceChanges: [], lastAnnounceMessageId: null };
        syncPricesToConstants();
    }
}

function syncPricesToConstants() {
    if (!data.prices) return;
    for (const [name, values] of Object.entries(data.prices)) {
        if (!constants.prices[name]) continue;
        for (const [type, value] of Object.entries(values)) {
            constants.prices[name][type] = value;
        }
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
    if (data.prices && data.prices[name] && data.prices[name][type] !== undefined) {
        return data.prices[name][type];
    }
    const fallback = constants.prices[name]?.[type];
    return fallback ?? 0;
}

function setPrice(name, type, value) {
    if (!data.prices) data.prices = {};
    if (!data.prices[name]) data.prices[name] = {};
    data.prices[name][type] = value;
    // ⭐ Auch direkt in constants updaten
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
    const priceLines = Object.keys(constants.prices).map((name) => {
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('```\nSPAWNER      🛒KAUFEN    💰VERKAUF\n────────────────────────────────────\n' + priceLines + '\n```'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('💰 **VERKAUFEN** — Du **verkaufst** uns deine Spawner'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🛒 **ANKAUF** — Du **kaufst** unsere Spawner'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Klicke unten auf den `💰 VERKAUFEN` oder `🛒 KAUFEN` Button,\num einen Trade zu Starten.'));

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
    get prices() { return data.prices; },
    save: saveData, reload: loadData,
    getPrice, setPrice, togglePrice, recordPriceChange, getRecentPriceChanges,
    getPanelMessageId, setPanelMessageId, getPanelChannelId, setPanelChannelId,
    getLastAnnounceMessageId, setLastAnnounceMessageId,
    buildPricePanel, updatePricePanel
};