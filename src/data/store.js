const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const constants = require('../config/constants');

const DATA_FILE = path.join(__dirname, '../../data/database.json');

let data = {
    tradeCounters: {},
    trades: {},
    vouches: [],
    traderStats: {},
    priceChanges: [],
    inventory: {},
    lastAnnounceMessageId: null
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            data = JSON.parse(raw);
        }
        if (!data.tradeCounters) data.tradeCounters = {};
        if (!data.trades) data.trades = {};
        if (!data.vouches) data.vouches = [];
        if (!data.traderStats) data.traderStats = {};
        if (!data.priceChanges) data.priceChanges = [];
        if (!data.inventory) data.inventory = {};
        if (data.lastAnnounceMessageId === undefined) data.lastAnnounceMessageId = null;
        
        for (const spawnerName of Object.keys(constants.prices)) {
            if (data.inventory[spawnerName] === undefined) {
                data.inventory[spawnerName] = 0;
            }
        }
        
        console.log('✅ Datenbank geladen:', Object.keys(data.trades).length, 'aktive Trades');
        console.log('📊 Trader-Stats:', Object.keys(data.traderStats).length, 'Trader erfasst');
        console.log('📦 Bestand:', JSON.stringify(data.inventory));
        if (data.panelMessageId) console.log('📌 Panel Message ID:', data.panelMessageId);
        if (data.panelChannelId) console.log('📌 Panel Channel ID:', data.panelChannelId);
        if (data.lastAnnounceMessageId) console.log('📢 Last Announce Message ID:', data.lastAnnounceMessageId);
    } catch (err) {
        console.error('❌ Fehler beim Laden:', err);
        data = { tradeCounters: {}, trades: {}, vouches: [], traderStats: {}, priceChanges: [], inventory: {}, lastAnnounceMessageId: null };
    }
}

function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Fehler beim Speichern:', err);
    }
}

function getPrice(spawnerName, type) {
    if (data.prices && data.prices[spawnerName] && data.prices[spawnerName][type] !== undefined) {
        return data.prices[spawnerName][type];
    }
    return constants.prices[spawnerName]?.[type] || 0;
}

function recordPriceChange(spawnerName, type, oldValue, newValue, userId) {
    data.priceChanges.push({
        spawner: spawnerName,
        type: type,
        oldValue: oldValue,
        newValue: newValue,
        userId: userId,
        timestamp: Date.now()
    });
    if (data.priceChanges.length > 50) {
        data.priceChanges = data.priceChanges.slice(-50);
    }
    saveData();
}

function getRecentPriceChanges(minutes) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return data.priceChanges.filter(c => c.timestamp >= cutoff);
}

function setPrice(spawnerName, type, value) {
    if (!data.prices) data.prices = {};
    if (!data.prices[spawnerName]) data.prices[spawnerName] = {};
    const oldValue = data.prices[spawnerName][type];
    data.prices[spawnerName][type] = value;
    if (constants.prices[spawnerName]) {
        constants.prices[spawnerName][type] = value;
    }
    saveData();
}

function togglePrice(spawnerName, type) {
    if (!data.prices) data.prices = {};
    if (!data.prices[spawnerName]) data.prices[spawnerName] = {};
    const current = data.prices[spawnerName][type];
    if (current === 'Stop') {
        const defaultValue = constants.prices[spawnerName]?.[type] || 0;
        data.prices[spawnerName][type] = defaultValue;
        if (constants.prices[spawnerName]) {
            constants.prices[spawnerName][type] = defaultValue;
        }
    } else {
        data.prices[spawnerName][type] = 'Stop';
        if (constants.prices[spawnerName]) {
            constants.prices[spawnerName][type] = 'Stop';
        }
    }
    saveData();
    return data.prices[spawnerName][type];
}

function getInventory(spawnerName) {
    return data.inventory[spawnerName] || 0;
}

function adjustInventory(spawnerName, amount) {
    if (!data.inventory) data.inventory = {};
    if (data.inventory[spawnerName] === undefined) data.inventory[spawnerName] = 0;
    data.inventory[spawnerName] += amount;
    if (data.inventory[spawnerName] < 0) data.inventory[spawnerName] = 0;
    saveData();
}

function getAllInventory() {
    return data.inventory || {};
}

function getPanelMessageId() { return data.panelMessageId || null; }
function setPanelMessageId(messageId) { data.panelMessageId = messageId; saveData(); }
function getPanelChannelId() { return data.panelChannelId || null; }
function setPanelChannelId(channelId) { data.panelChannelId = channelId; saveData(); }

function getLastAnnounceMessageId() { return data.lastAnnounceMessageId || null; }
function setLastAnnounceMessageId(messageId) { data.lastAnnounceMessageId = messageId; saveData(); }

function buildPricePanel() {
    const priceLines = Object.entries(constants.prices).map(([name]) => {
        const dynAnkauf = getPrice(name, 'ankauf');
        const dynVerkauf = getPrice(name, 'verkauf');
        
        const ankauf = dynAnkauf === 'Stop' ? 'STOP' : `${dynAnkauf.toFixed(1)}M`;
        const verkauf = dynVerkauf === 'Stop' ? 'STOP' : `${dynVerkauf.toFixed(1)}M`;
        const emoji = constants.spawnerEmojis[name] || '📦';
        return `${emoji} ${name.padEnd(12)} ${ankauf.padStart(10)}  ${verkauf.padStart(10)}`;
    }).join('\n');

    const stockLines = Object.entries(constants.prices).map(([name]) => {
        const stock = getInventory(name);
        const emoji = constants.spawnerEmojis[name] || '📦';
        return `**${emoji} ${name}:** \`${stock} Stk.\``;
    }).join('\n');

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## :shopping_cart: • SPAWNER TRADING • :moneybag:\n*Yayks Spawner Trading*\n||*Only Trusted Trader, Faire Preise :purple_heart:*||')
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '```\n' +
                'SPAWNER      🛒ANKAUF    💰VERKAUF\n' +
                '────────────────────────────────────\n' +
                priceLines + '\n' +
                '```'
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### 📦 • AKTUELLER BESTAND\n` +
                `${stockLines}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('💰 **VERKAUFEN** — Du **verkaufst** uns deine Spawner')
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('🛒 **ANKAUF** — Du **kaufst** unsere Spawner')
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('Klicke unten auf den `💰 VERKAUFEN` oder `🛒 ANKAUF` Button,\num einen Trade zu Starten.')
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('spawner_ankaufen')
            .setLabel('Spawner Kaufen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🛒'),
        new ButtonBuilder()
            .setCustomId('spawner_verkaufen')
            .setLabel('Spawner Verkaufen')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💰')
    );

    return [container, row];
}

async function updatePricePanel(client) {
    const messageId = getPanelMessageId();
    const channelId = getPanelChannelId();
    
    if (!messageId || !channelId) {
        console.log('⚠️ Panel Update übersprungen: messageId/channelId fehlt.');
        return;
    }
    
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.log('⚠️ Panel Channel nicht gefunden:', channelId);
            return;
        }
        const msg = await channel.messages.fetch(messageId);
        const components = buildPricePanel();
        await msg.edit({ components, flags: MessageFlags.IsComponentsV2 });
        console.log('✅ Price Panel auto-updated!');
    } catch (err) {
        console.log('❌ Panel update fehlgeschlagen:', err.message);
    }
}

loadData();

module.exports = {
    get tradeCounters() { return data.tradeCounters; },
    get trades() { return data.trades; },
    get vouches() { return data.vouches; },
    get traderStats() { return data.traderStats; },
    get inventory() { return data.inventory; },
    save: saveData,
    reload: loadData,
    getPrice,
    setPrice,
    togglePrice,
    recordPriceChange,
    getRecentPriceChanges,
    getPanelMessageId,
    setPanelMessageId,
    getPanelChannelId,
    setPanelChannelId,
    getLastAnnounceMessageId,
    setLastAnnounceMessageId,
    buildPricePanel,
    updatePricePanel,
    getInventory,
    adjustInventory,
    getAllInventory
};