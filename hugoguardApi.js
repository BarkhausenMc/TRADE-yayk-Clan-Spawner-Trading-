const constants = require('../config/constants');

const PRICE_FIELDS = {
    ankauf: { field: 'buyPrice', otherField: 'sellPrice' },
    verkauf: { field: 'sellPrice', otherField: 'buyPrice' }
};

function getBaseUrl() {
    return constants.HUGOGUARD_API_URL.replace(/\/+$/, '');
}

async function request(item, method, body) {
    if (!constants.HUGOGUARD_API_KEY) {
        throw new Error('HUGOGUARD_API_KEY fehlt in der .env-Datei.');
    }

    const response = await fetch(
        `${getBaseUrl()}/partner/v1/spawners/${encodeURIComponent(item)}`,
        {
            method,
            headers: {
                'x-partner-api-key': constants.HUGOGUARD_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const responseText = await response.text();
        let details = responseText;
        try {
            const parsed = JSON.parse(responseText);
            details = parsed.message || parsed.error || responseText;
        } catch (err) {
            // Keep the response text when the API does not return JSON.
        }
        const error = new Error(`HugoGuard API antwortet mit HTTP ${response.status}: ${details}`);
        error.status = response.status;
        throw error;
    }
}

async function updateSpawnerPrice(spawner, type, price) {
    const item = constants.hugoguardSpawnerItems[spawner];
    const priceFields = PRICE_FIELDS[type];
    if (!item || !priceFields) {
        throw new Error(`Kein HugoGuard-Mapping für ${spawner} (${type}) konfiguriert.`);
    }

    const apiPrice = price === null ? null : Math.round(price * 1_000_000);
    if (apiPrice !== null && (!Number.isSafeInteger(apiPrice) || apiPrice < 0)) {
        throw new Error(`Ungültiger Preis für HugoGuard: ${price}`);
    }

    const body = { [priceFields.field]: apiPrice };
    try {
        await request(item, 'PATCH', body);
    } catch (err) {
        if (err.status !== 404) throw err;
        if (apiPrice === null) return;

        await request(item, 'PUT', {
            quantity: null,
            [priceFields.field]: apiPrice,
            [priceFields.otherField]: null
        });
    }
}

module.exports = { updateSpawnerPrice };
