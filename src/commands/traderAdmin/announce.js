const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const constants = require('../../config/constants');
const store = require('../../data/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('📢 Preisänderungen ankündigen (Trader Admin)')
        .addStringOption(opt =>
            opt.setName('titel')
                .setDescription('Titel der Ankündigung (z.B. "Preisanpassung KW 34")')
                .setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName('ping')
                .setDescription('Soll die Spawner Price Rolle gepingt werden?')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.log('❌ deferReply fehlgeschlagen:', err.message);
            return;
        }

        if (!interaction.member.roles.cache.has(constants.TRADER_ADMIN_ROLE_ID)) {
            await interaction.editReply({ content: '❌ Nur Trader Admins!' });
            return;
        }

        const titel = interaction.options.getString('titel') || '📋 Preisänderung';
        const ping = interaction.options.getBoolean('ping') ?? false;

        const recentChanges = store.getRecentPriceChanges(5);

        if (recentChanges.length === 0) {
            await interaction.editReply({ content: '❌ Keine Preisänderungen in den letzten 5 Minuten!' });
            return;
        }

        const changeLines = recentChanges.map(change => {
            const emoji = constants.spawnerEmojis[change.spawner] || '📦';
            const typLabel = change.type === 'ankauf' ? '🛒 Ankauf' : '💰 Verkauf';

            const oldStr = change.oldValue === 'Stop' ? 'GESTOPPT' : `${parseFloat(change.oldValue).toFixed(1)}M`;
            const newStr = change.newValue === 'Stop' ? 'GESTOPPT' : `${parseFloat(change.newValue).toFixed(1)}M`;

            let arrow;
            if (change.newValue === 'Stop') arrow = '🔴';
            else if (change.oldValue === 'Stop') arrow = '🟢';
            else if (typeof change.newValue === 'number' && typeof change.oldValue === 'number') {
                if (change.newValue > change.oldValue) arrow = '📈';
                else if (change.newValue < change.oldValue) arrow = '📉';
                else arrow = '➡️';
            } else arrow = '➡️';

            return `### ${emoji} ${change.spawner} — ${typLabel}\n${arrow} ~~${oldStr}~~ → **${newStr}**\n*vor <t:${Math.floor(change.timestamp / 1000)}:R>*`;
        }).join('\n\n');

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## 📢 ${titel}\n\n`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> *Folgende Preise wurden geändert:*\n` + changeLines)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `> 📋 Unsere **Aktuellen Preise** siehst du im Trading Panel.\n` +
                    `||Geändert von <@${interaction.user.id}>||`
                )
            );

        if (ping && constants.SPAWNER_PRICE_ROLE_ID) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<@&${constants.SPAWNER_PRICE_ROLE_ID}>`)
            );
        }

        const announceChannelId = constants.ANNOUNCE_CHANNEL_ID || constants.CHANNEL_ID;
        const channel = interaction.guild.channels.cache.get(announceChannelId);

        if (!channel) {
            await interaction.editReply({ content: '❌ Ankündigungs-Channel nicht gefunden!' });
            return;
        }

        const lastMessageId = store.getLastAnnounceMessageId();
        if (lastMessageId) {
            try {
                const lastMsg = await channel.messages.fetch(lastMessageId);
                await lastMsg.delete();
                console.log('🗑️ Alte Announce gelöscht:', lastMessageId);
            } catch (err) {
                console.log('⚠️ Alte Announce nicht gefunden:', err.message);
            }
        }

        await interaction.editReply({ content: '✅ Ankündigung wird gesendet...' });

        const newMessage = await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: ['roles', 'everyone', 'users'] }
        });

        store.setLastAnnounceMessageId(newMessage.id);
        await interaction.editReply({ content: `✅ Ankündigung gesendet in <#${announceChannelId}>!` });
    }
};