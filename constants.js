module.exports = {
    prices: {
        Skeleton: { ankauf: 10.0, verkauf: 10.0 },
        Creeper:  { ankauf: 10.0, verkauf: 10.0 },
        Iron_Golem: { ankauf: 10.0, verkauf: 10.0 },
        Blaze: { ankauf: 10.0, verkauf: 10.0 },
        Spider: { ankauf: 10.0, verkauf: 10.0 },
    },

    spawnerEmojis: {
        Skeleton: '💀',
        Creeper:  '💥',
        Iron_Golem: '🐻‍❄️',
        Blaze: '🔥',
        Spider: '🕷️',
    },

    hugoguardSpawnerItems: {
        Skeleton: 'SKELETON',
        Creeper: 'CREEPER',
        Iron_Golem: 'IRON_GOLEM',
        Blaze: 'BLAZE',
        Spider: 'SPIDER'
    },

    HUGOGUARD_API_URL: process.env.HUGOGUARD_API_URL || 'https://api.hugoguard.net',
    HUGOGUARD_API_KEY: process.env.HUGOGUARD_API_KEY,
    TRADER_ROLE_ID: process.env.TRADER_ROLE_ID,
    TRADER_ADMIN_ROLE_ID: process.env.TRADER_ADMIN_ROLE_ID,
    SPAWNER_PRICE_ROLE_ID: process.env.SPAWNER_PRICE_ROLE_ID,
    CHANNEL_ID: process.env.CHANNEL_ID,
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
    ANNOUNCE_CHANNEL_ID: process.env.ANNOUNCE_CHANNEL_ID
};