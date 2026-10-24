const {
    Client,
    GatewayIntentBits,
    MessageFlags,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const store = require('./src/data/store');
const handleButton = require('./src/handlers/buttonHandler');
const handleSelectMenu = require('./src/handlers/selectMenuHandler');
const handleModal = require('./src/handlers/modalHandler');

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
        )
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

client.on('interactionCreate', async (interaction) => {
    try {
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
        }

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