const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const constants = require('./src/config/constants');
const store = require('./src/data/store');
const handleButton = require('./src/handlers/buttonHandler');
const handleSelectMenu = require('./src/handlers/selectMenuHandler');
const handleModal = require('./src/handlers/modalHandler');

// ⭐ COMMANDS AUS ORDNER LADEN
const commandMap = new Map();
const commandPath = path.join(__dirname, 'src/commands');
if (fs.existsSync(commandPath)) {
    for (const folder of fs.readdirSync(commandPath)) {
        const folderPath = path.join(commandPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
            const cmd = require(path.join(folderPath, file));
            if (cmd.data && cmd.execute) {
                commandMap.set(cmd.data.name, cmd);
            }
        }
    }
}

const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup-Befehle für den Bot')
        .addSubcommand(sub =>
            sub.setName('spawner')
                .setDescription('Sendet das Spawner Trading Panel in den aktuellen Channel')
        ),
    new SlashCommandBuilder()
        .setName('trader-stats')
        .setDescription('Zeigt die Handelsstatistiken eines Traders an')
        .addUserOption(opt =>
            opt.setName('trader')
                .setDescription('Welcher Trader? (Leer = dich selbst)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('trader-top')
        .setDescription('Zeigt die Top 10 Trader nach abgeschlossenen Trades')
];

for (const cmd of commandMap.values()) {
    commands.push(cmd.data);
}

global.client = null;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
global.client = client;

// === READY EVENT ===
client.once('ready', async () => {
    console.log('Bot ist online!');

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log('✅ Slash Commands registriert (Guild)!', commands.length, 'Commands');
    } catch (error) {
        console.error('❌ Fehler beim Registrieren der Commands:', error);
    }
});

// === INTERACTION HANDLER ===
client.on('interactionCreate', async (interaction) => {
    try {
        // ==========================================
        // SLASH COMMANDS
        // ==========================================
        if (interaction.isChatInputCommand()) {

            if (commandMap.has(interaction.commandName)) {
                const command = commandMap.get(interaction.commandName);
                await command.execute(interaction);
                return;
            }

            if (interaction.commandName === 'setup') {
                if (interaction.options.getSubcommand() === 'spawner') {
                    if (!interaction.memberPermissions.has('Administrator')) {
                        await interaction.reply({ content: '❌ Nur Administratoren können das Setup ausführen.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                    try {
                        const recentMessages = await interaction.channel.messages.fetch({ limit: 20 });
                        for (const msg of recentMessages.values()) {
                            if (!msg.components || msg.components.length === 0) continue;
                            for (const row of msg.components) {
                                if (!row.components) continue;
                                for (const comp of row.components) {
                                    if (comp.customId === 'spawner_ankaufen' || comp.customId === 'spawner_verkaufen') {
                                        try { await msg.delete(); } catch (e) {}
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.log('Fehler beim Aufräumen alter Panels:', err.message);
                    }

                    const components = store.buildPricePanel();
                    const panelMsg = await interaction.channel.send({
                        components,
                        flags: MessageFlags.IsComponentsV2
                    });

                    store.setPanelMessageId(panelMsg.id);
                    store.setPanelChannelId(interaction.channel.id);
                    await interaction.editReply({ content: '✅ Spawner Trading Panel gesendet!' });
                    return;
                }
            }

            if (interaction.commandName === 'trader-stats') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const targetUser = interaction.options.getUser('trader') || interaction.user;
                const stats = store.traderStats?.[targetUser.id];

                if (!stats || stats.completedTrades === 0) {
                    await interaction.editReply({ content: `❌ <@${targetUser.id}> hat noch keine abgeschlossenen Trades.` });
                    return;
                }

                const avgStars = stats.starCount > 0 ? (stats.totalStars / stats.starCount).toFixed(1) : 'N/A';

                const statsContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `## 📊 • Trader Statistiken\n\n` +
                            `**🤝 Trader:** <@${targetUser.id}>\n\n` +
                            `**✅ Abgeschlossene Trades:** ${stats.completedTrades}\n` +
                            `**⭐ Durchschnittliche Bewertung:** ${avgStars} / 5\n\n`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `## 💸 • Umsatz\n` +
                            `**💰 Gesamtvolumen:** ${(stats.totalVolume || 0).toFixed(1)}M\n` +
                            `**➕ Eingenommen (Ankauf):** ${(stats.totalEarned || 0).toFixed(1)}M\n` +
                            `**➖ Ausgezahlt (Verkauf):** ${(stats.totalSpent || 0).toFixed(1)}M\n`
                        )
                    );

                await interaction.editReply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            // --- /trader-top ---
if (interaction.commandName === 'trader-top') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // NULL-SCHUTZ
    if (!store.traderStats) {
        await interaction.editReply({ content: '❌ Interne Fehler - Trader-Stats nicht geladen.' });
        return;
    }

    const allStats = Object.entries(store.traderStats)
        .filter(([, s]) => s && s.completedTrades > 0 && s.starCount > 0) // Nur wer bewertet wurde
        .map(([userId, s]) => ({
            userId,
            ...s,
            avgRating: s.starCount > 0 ? (s.totalStars / s.starCount) : 0 // Durchschnitt berechnen
        }))
        .sort((a, b) => b.avgRating - a.avgRating) // SORTIERUNG NACH DURCHSCHNITT (Höchste zuerst)
        .slice(0, 10); // Top 10

    if (allStats.length === 0) {
        await interaction.editReply({ content: '❌ Noch keine Bewertungen vorhanden.' });
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const leaderboard = allStats.map(({ userId, completedTrades, avgRating, totalVolume }, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        // Formatierung: 2 Dezimalstellen für Sterne
        return `${medal} <@${userId}> — ⭐ ${avgRating.toFixed(2)} | 🤝 ${completedTrades} Trades | 💎 ${(totalVolume || 0).toFixed(1)}M`;
    }).join('\n');

    const topContainer = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🏆 • Top Trader nach Bewertung ⭐\n\n` +
                `Sortiert nach durchschnittlicher Bewertung (min. 1 Trade)\n\n` +
                leaderboard
            )
        );

    await interaction.editReply({ components: [topContainer], flags: MessageFlags.IsComponentsV2 });
    return;
}
        }

        // ==========================================
        // BUTTONS, SELECT MENUS, MODALS
        // ==========================================
        if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        }
    } catch (error) {
        console.error('Fehler bei Interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ein Fehler ist aufgetreten.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);