Yayk Clan Spawner trading Bot

## HugoGuard-API

`/setprice` und `/toggletrade` synchronisieren ihre Preisänderungen mit der HugoGuard Partner-API. Dafür muss ein vom HugoGuard-Admin freigeschalteter Partner-API-Key serverseitig in der `.env` gesetzt sein:

```env
HUGOGUARD_API_KEY=hgpt_dein_api_key
HUGOGUARD_API_URL=https://api.hugoguard.net
```

`HUGOGUARD_API_URL` kann entfallen; standardmäßig wird `https://api.hugoguard.net` verwendet. Der API-Key benötigt den Bereich `canManageSpawnerStock`. Discord-Preise in Millionen werden als ganze Preiseinheiten an HugoGuard gesendet (z. B. `12.5` → `12500000`).
