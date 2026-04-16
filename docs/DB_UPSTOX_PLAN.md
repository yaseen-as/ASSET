# Plan — Database-per-Service + Upstox Integration

> Created: 2026-04-16

---

## Part A — Database-per-Service Migration

### Current state vs target

```
CURRENT                                    TARGET
───────────────────────────────────        ──────────────────────────────────────
Single PostgreSQL instance                 Single PostgreSQL instance (same host)
Single database: asset_management          Four databases, one per service

  asset_management                           auth_db          (auth-service)
    schema: auth                               schema: auth
    schema: users                              schema: users
    schema: broker          ──────────►      trading_db       (trading-service)
    schema: portfolio                          schema: broker
    schema: market                             schema: portfolio
    schema: recommendations                  market_db        (market-service)
    schema: alerts                             schema: market
    schema: notifications                      schema: recommendations
                                             engagement_db    (engagement-service)
                                               schema: alerts
                                               schema: notifications
```

**Why**: Schema isolation is already in place. Separate databases give true connection isolation — a bug in trading-service cannot accidentally query auth tables even if the PG user is misconfigured. Each service is also independently restorable from backup.

**What does NOT change**: Schema names, table names, column names, Knex migrations, repository code. Only the `database` field in the connection config changes.

---

### Changes per file

#### 1. `database.ts` — every service

Add an admin pre-connect step that creates the database if it doesn't exist, then connect to it.

**Pattern (same for all 4 services, only DB name changes):**

```typescript
// services/<name>/src/config/database.ts

import knex, { Knex } from 'knex';
import { config } from './index';

// ── Admin connection (postgres default DB) ────────────────────────────────────
// Used only at startup to create the service database if it doesn't exist yet.
// Destroyed immediately after.
async function ensureDatabase(): Promise<void> {
  const admin = knex({
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: 'postgres',          // always exists on any PG instance
      user: config.db.user,
      password: config.db.password,
    },
  });
  try {
    await admin.raw(`CREATE DATABASE "${config.db.database}"`);
  } catch (err: any) {
    if (!err.message.includes('already exists')) throw err;
    // Database already exists — fine, continue
  } finally {
    await admin.destroy();
  }
}

// ── Service connection ────────────────────────────────────────────────────────
export const db = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  },
  searchPath: ['<schema_a>', '<schema_b>', 'public'],  // service-specific schemas
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    schemaName: '<schema_a>',
    tableName: 'knex_migrations',
  },
});

export async function initDatabase(): Promise<void> {
  await ensureDatabase();
  await db.raw('CREATE SCHEMA IF NOT EXISTS <schema_a>');
  await db.raw('CREATE SCHEMA IF NOT EXISTS <schema_b>');  // if service has 2 schemas
  await db.migrate.latest();
}
```

**Per-service database name and schemas:**

| Service | `config.db.database` | Schemas |
|---------|---------------------|---------|
| auth-service | `auth_db` | `auth`, `users` |
| trading-service | `trading_db` | `broker`, `portfolio` |
| market-service | `market_db` | `market`, `recommendations` |
| engagement-service | `engagement_db` | `alerts`, `notifications` |

#### 2. `config/index.ts` — remove `schema` field from auth-service

Auth-service currently has a `schema` field in its config. Remove it — schema names are now hardcoded in `database.ts` (they never change per environment).

```typescript
// services/auth-service/src/config/index.ts
db: {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'auth_db',   // changed default
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // schema field REMOVED
},
```

#### 3. K8s ConfigMaps — update `DB_NAME` per service

```yaml
# k8s/base/services/auth-service/configmap.yaml
data:
  DB_NAME: auth_db          # was asset_management

# k8s/base/services/trading-service/configmap.yaml
data:
  DB_NAME: trading_db       # was asset_management

# k8s/base/services/market-service/configmap.yaml
data:
  DB_NAME: market_db        # was asset_management

# k8s/base/services/engagement-service/configmap.yaml
data:
  DB_NAME: engagement_db    # was asset_management
```

#### 4. PostgreSQL K8s setup — DB user must have CREATEDB privilege

The `admin` user needs `CREATEDB` so the `ensureDatabase()` call works:

```sql
-- Run once after PostgreSQL is deployed:
ALTER USER admin CREATEDB;
```

Add this to the PostgreSQL init script / ConfigMap if one exists, or run it as a one-time job.

#### 5. Local `.env` files — update default DB names

```env
# services/auth-service/.env
DB_NAME=auth_db

# services/trading-service/.env
DB_NAME=trading_db

# services/market-service/.env
DB_NAME=market_db

# services/engagement-service/.env
DB_NAME=engagement_db
```

---

### Migration checklist (Part A)

- [ ] Update `database.ts` in all 4 services — add `ensureDatabase()`, update searchPath/schemaName
- [ ] Update `config/index.ts` in auth-service — remove `schema` field, change default `DB_NAME`
- [ ] Update `config/index.ts` in all other services — change default `DB_NAME`
- [ ] Update K8s ConfigMaps — set correct `DB_NAME` per service
- [ ] Grant `CREATEDB` to the PostgreSQL user
- [ ] Update local `.env` files
- [ ] Drop old auth-service `DB_SCHEMA` env var from K8s configmap (no longer used)

---

## Part B — Upstox API Integration

### Why Upstox (vs Angel One)

- Standard OAuth 2.0 — user tokens are completely per-user, no shared API key
- No `ANGEL_ONE_API_KEY` in env needed — app credentials (`CLIENT_ID`/`CLIENT_SECRET`) are in env, but every API call uses a user token fetched from the database
- Modern REST API with well-documented endpoints

### The "no env for API key" design

```
Angel One (current)                     Upstox (new)
───────────────────────────────         ──────────────────────────────────────
ANGEL_ONE_API_KEY in env/secret         UPSTOX_CLIENT_ID in env (app credential)
Same key used for all users             UPSTOX_CLIENT_SECRET in env (app credential)
                                        Per-user access_token stored in DB
                                        Fetched at request time → used in API call
```

App credentials (`CLIENT_ID`, `CLIENT_SECRET`) remain in env — they identify the platform's registered app on Upstox. User tokens are never in env.

---

### User flow — first-time onboarding

```
1. User registers / logs in
         │
         ▼
2. Frontend checks broker connection status
   GET /v1/broker/status  →  { connected: false }
         │
         ▼
3. Frontend shows "Connect your broker" screen (mandatory first step)
         │
         ▼
4. User clicks "Connect Upstox"
   GET /v1/broker/connect/upstox
   → Backend returns: { authUrl: "https://api.upstox.com/v2/login/authorization/dialog?..." }
         │
         ▼
5. Frontend opens the authUrl in a new tab / redirect
         │
         ▼
6. User logs in on Upstox and authorizes the app
         │
         ▼
7. Upstox redirects to our callback URL:
   GET /v1/broker/callback/upstox?code=AUTH_CODE&state=USER_ID
         │
         ▼
8. Backend exchanges code → access_token + refresh_token
   Stores encrypted tokens in broker.connections (trading_db)
         │
         ▼
9. Frontend is notified (redirect or polling)
   GET /v1/broker/status  →  { connected: true, broker: 'upstox' }
         │
         ▼
10. User now has full access to portfolio, trading, market data
```

---

### Upstox OAuth 2.0 details

**Authorization URL:**
```
https://api.upstox.com/v2/login/authorization/dialog
  ?response_type=code
  &client_id={UPSTOX_CLIENT_ID}
  &redirect_uri={UPSTOX_REDIRECT_URI}
  &state={userId}           ← embed userId so callback knows who to store token for
```

**Token exchange (POST):**
```
https://api.upstox.com/v2/login/authorization/token
Content-Type: application/x-www-form-urlencoded

code={AUTH_CODE}
&client_id={UPSTOX_CLIENT_ID}
&client_secret={UPSTOX_CLIENT_SECRET}
&redirect_uri={UPSTOX_REDIRECT_URI}
&grant_type=authorization_code
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Note: Upstox access tokens are daily — they expire end-of-day. No refresh token in the standard flow; user must re-authorize each trading day (common for Indian brokers).

---

### Upstox API endpoint mapping

| Feature | Upstox Endpoint |
|---------|----------------|
| Holdings | `GET /v2/portfolio/long-term-holdings` |
| Positions | `GET /v2/portfolio/short-term-positions` |
| Place order | `POST /v2/order/place` |
| Order book | `GET /v2/order/retrieve-all` |
| Cancel order | `DELETE /v2/order/cancel` |
| Market quote (LTP) | `GET /v2/market-quote/ltp?symbol={key}` |
| Full quote | `GET /v2/market-quote/quotes?symbol={key}` |
| OHLCV intraday | `GET /v2/historical-candle/intraday/{key}/{unit}` |
| OHLCV historical | `GET /v2/historical-candle/{key}/{unit}/{to}/{from}` |
| Instrument search | `GET /v2/instruments` (CSV download, cached) |

**Instrument key format**: `NSE_EQ|{ISIN}` or `NSE_EQ|{symbol}` — Upstox uses `|` separator.
Example: `NSE_EQ|INE009A01021` for INFOSYS.

---

### Files to create / change

#### New files

```
services/trading-service/src/broker/
  ├── upstox.client.ts            # HTTP wrapper — reads token from DB, not env
  ├── upstox-auth.service.ts      # OAuth flow: build URL, exchange code, store tokens
  └── upstox-instrument.service.ts # Instrument master: download CSV, cache in Redis
```

#### Changed files

```
services/trading-service/
  ├── src/config/index.ts              # add upstox: { clientId, clientSecret, redirectUri }
  ├── src/broker/broker.service.ts     # replace AngelOne client with Upstox client
  ├── src/broker/broker.routes.ts      # add /connect/upstox, /callback/upstox, /status
  ├── src/market/market-data.service.ts  (trading-service)
  │                                    # replace AngelOne quote call with Upstox quote
  └── migrations/
      └── 20260417000001_update_broker_connections_upstox.ts   # new migration
```

---

### Migration — update `broker.connections` table

The current table stores `client_id` (Angel One user code) which Upstox doesn't need. Add `expires_at` and remove the unique constraint on `broker_name` so a user can't accidentally add the same broker twice without using the existing row.

```typescript
// services/trading-service/migrations/20260417000001_update_broker_connections_upstox.ts

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').alterTable('connections', (table) => {
    // client_id was the Angel One user code — Upstox doesn't use a per-user key
    // Rename to 'broker_user_id' to store Upstox's user_id from their profile API
    table.renameColumn('client_id', 'broker_user_id');

    // Daily token expiry (Upstox tokens expire end-of-trading-day)
    table.timestamp('expires_at', { useTz: true }).nullable().alter();

    // Store which scopes were granted
    table.text('scopes').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('broker').alterTable('connections', (table) => {
    table.renameColumn('broker_user_id', 'client_id');
    table.dropColumn('scopes');
  });
}
```

---

### `upstox.client.ts` — design

```typescript
// No API key injected at construction.
// Every method receives userId, fetches the token from DB at call time.

export class UpstoxClient {
  private readonly baseUrl = 'https://api.upstox.com/v2';

  // Token is always read from the DB — never from env
  private async getToken(userId: string): Promise<string> {
    const conn = await brokerRepo.getActiveConnection(userId, 'upstox');
    if (!conn) throw new ServiceError('BROKER_NOT_CONNECTED', 401, 'Upstox account not connected');
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      throw new ServiceError('TOKEN_EXPIRED', 401, 'Upstox session expired, please reconnect');
    }
    return decrypt(conn.access_token);
  }

  async getHoldings(userId: string): Promise<UpstoxHolding[]> {
    const token = await this.getToken(userId);
    const { data } = await axios.get(`${this.baseUrl}/portfolio/long-term-holdings`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return data.data;
  }

  async getQuote(userId: string, instrumentKey: string): Promise<UpstoxQuote> {
    const token = await this.getToken(userId);
    const { data } = await axios.get(`${this.baseUrl}/market-quote/quotes`, {
      params: { symbol: instrumentKey },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data[instrumentKey];
  }

  // ... placeOrder, getOrderBook, getHistoricalCandles, etc.
}
```

---

### `upstox-auth.service.ts` — design

```typescript
export class UpstoxAuthService {
  // Step 1: Build the Upstox authorization URL for the user to visit
  buildAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.upstox.clientId,
      redirect_uri: config.upstox.redirectUri,
      state: userId,   // will be returned in callback
    });
    return `https://api.upstox.com/v2/login/authorization/dialog?${params}`;
  }

  // Step 2: Exchange the code for tokens and store them
  async handleCallback(code: string, userId: string): Promise<void> {
    const response = await axios.post(
      'https://api.upstox.com/v2/login/authorization/token',
      new URLSearchParams({
        code,
        client_id: config.upstox.clientId,
        client_secret: config.upstox.clientSecret,
        redirect_uri: config.upstox.redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, expires_in } = response.data;

    // Upsert: if connection row exists update it, otherwise insert
    await brokerRepo.upsertConnection({
      user_id: userId,
      broker_name: 'upstox',
      access_token: encrypt(access_token),
      expires_at: new Date(Date.now() + expires_in * 1000),
      is_active: true,
    });
  }
}
```

---

### New routes on `broker.routes.ts`

```typescript
// Check if user has an active broker connection
GET  /broker/status

// Return the Upstox OAuth authorization URL
GET  /broker/connect/upstox

// Upstox redirects here after user authorizes
GET  /broker/callback/upstox?code=AUTH_CODE&state=USER_ID

// Disconnect (delete the connection row)
DELETE /broker/disconnect/upstox
```

---

### `config/index.ts` — add Upstox section, remove Angel One

```typescript
// services/trading-service/src/config/index.ts

// REMOVE:
angelOne: {
  apiKey: process.env.ANGEL_ONE_API_KEY || '',
  apiUrl: ...,
  scripMasterUrl: ...,
},

// ADD:
upstox: {
  clientId: process.env.UPSTOX_CLIENT_ID || '',
  clientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
  redirectUri: process.env.UPSTOX_REDIRECT_URI || 'http://localhost:3000/v1/broker/callback/upstox',
},
```

---

### K8s secret — trading-service

```yaml
# k8s/base/services/trading-service/secret.yaml
stringData:
  BROKER_TOKEN_ENCRYPTION_KEY: "CHANGE_ME"
  UPSTOX_CLIENT_ID: "CHANGE_ME"          # from Upstox developer portal
  UPSTOX_CLIENT_SECRET: "CHANGE_ME"      # from Upstox developer portal
  DB_PASSWORD: "CHANGE_ME"
  # ANGEL_ONE_API_KEY: REMOVED
```

---

### Frontend — first-time broker connection guard

The frontend needs to check broker connection status after login and redirect to the connect page if not connected.

```typescript
// frontend: after successful login, before loading dashboard
const status = await api.get('/v1/broker/status');
if (!status.connected) {
  navigate('/onboarding/connect-broker');  // mandatory step
}
```

The connect page calls `GET /v1/broker/connect/upstox`, receives the auth URL, and opens it. After the OAuth callback completes, the backend stores the token and the frontend can proceed.

---

## Implementation order

### Phase 1 — Database per service (lower risk, do first)

| Step | File(s) | What changes |
|------|---------|-------------|
| 1 | `services/*/src/config/database.ts` | Add `ensureDatabase()`, update `searchPath` |
| 2 | `services/auth-service/src/config/index.ts` | Remove `schema` field, default `DB_NAME=auth_db` |
| 3 | `services/*/src/config/index.ts` | Update `DB_NAME` defaults for each service |
| 4 | `k8s/base/services/*/configmap.yaml` | Set correct `DB_NAME` per service |
| 5 | `k8s/base/services/auth-service/configmap.yaml` | Remove `DB_SCHEMA` key |
| 6 | PostgreSQL init | Grant `CREATEDB` to `admin` user |

### Phase 2 — Upstox integration (higher complexity)

| Step | File(s) | What changes |
|------|---------|-------------|
| 1 | `services/trading-service/src/config/index.ts` | Add `upstox` block, remove `angelOne` |
| 2 | `k8s/base/services/trading-service/secret.yaml` | Replace Angel One keys with Upstox keys |
| 3 | Migration `20260417000001_*` | Rename `client_id` → `broker_user_id`, add `expires_at` |
| 4 | `upstox.client.ts` | New — all API calls, token from DB |
| 5 | `upstox-auth.service.ts` | New — build OAuth URL, handle callback |
| 6 | `upstox-instrument.service.ts` | New — download/cache instrument CSV |
| 7 | `broker.service.ts` | Replace Angel One calls with Upstox client |
| 8 | `broker.routes.ts` | Add `/connect/upstox`, `/callback/upstox`, `/status` |
| 9 | `market-data.service.ts` (trading) | Update quote endpoint to Upstox format |
| 10 | `market-service` (market-data.service.ts) | Update fallback quote URL format |
| 11 | Frontend | Add broker connection guard after login |

---

## What gets deleted

| Item | Reason |
|------|--------|
| `services/trading-service/src/broker/angelone.client.ts` | Replaced by `upstox.client.ts` |
| `services/trading-service/src/broker/symbol-master.service.ts` | Replaced by `upstox-instrument.service.ts` |
| `ANGEL_ONE_API_KEY` from all secrets/configs | No longer needed |
| `DB_SCHEMA` env var from auth-service | Hardcoded in `database.ts` |
