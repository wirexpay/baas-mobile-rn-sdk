# Example configuration — the debug menu

This example is one binary that exercises **every SDK surface** against **any partner's data**. Nothing
is hard-coded: the **Config** tab is a per-field editor for the integration parameters and credentials, and
every screen reads it live. The same field set is the contract for the iOS, Android, React Native and Flutter
examples, so QA enters the same values everywhere; the Wallet screen additionally takes the estimation id and
the provider block, or fetches an estimate with your bearer.

## Fields

### Environment
| Field | What it is |
|---|---|
| `environment` | `test` or `production`. Maps to the SDK's `testMode`; the SDK holds the hosts itself. Trade takes the name as is; a full trade runs on `production` only. |

### Integration parameters (non-secret)
| Field | What it is | Who gives it |
|---|---|---|
| `chainId` | `X-Chain-Id` — the chain the partner operates on. For Trade, the main account's chain: Base (8453) or Arc (5042) | **Wirex**, per integration |
| `companyId` | `X-Company-Id` of the key login — the test user's company | **Wirex**, per integration |
| `clientId` | `?client=` on the hosted pages (optional) | **Wirex** |
| `userEmail` / `userWallet` | identity headers `X-User-Email` / `X-User-Wallet` | partner (the signed-in user) |
| `cardId` | the card Reveal / Collect act on | partner (a provisioned card) |
| `cardholderName` | display name on Collect | partner |
| `walletAmount` / `walletCurrency` / `walletProvider` | the top-up quote the Wallet screens arm with | partner (from an estimate) |
| `baasApiUrl` | the BaaS API base URL (https, without `/api`) for the key login and the Wallet screen's **Fetch estimate** helper; pricing is the partner backend's job, the helper only verifies a bearer | **Wirex**, per environment |
| `returnUrl` | Custom Tab App Link — **https, verified for this app's package** (`assetlinks.json`) | partner |

### Secrets (memory only — never persisted, never logged)
| Field | What it is | In production it is |
|---|---|---|
| `bearer` | `getAccessToken` — Wirex bearer for the user | minted by the partner's auth |
| `actionToken` | `getActionToken` — step-up for card data / PIN | the user's **wallet signature**, exchanged by the partner's backend |
| `checkoutToken` | token mode — the short-lived top-up token | minted by the **partner's backend** |
| `ownerKey` | **testing only** — the test user's exported key. Trade signs each step with it, and with no `bearer` the example logs in with it | never in the app: the user's own wallet signs |

## Where the values come from

Each app fills its config from three sources. A higher source wins over a lower one.

| Order | Source | Notes |
|---|---|---|
| 1, highest | A gitignored `example/e2e.local.json`, read only in a debug build | Flat JSON with the field names above, `ownerKey` included. A release bundle and a CI build get an empty module in its place. Its fields show read-only on the Config tab. Template: `example/e2e.local.example.json` |
| 2 | The Config tab | Secrets, `ownerKey` included, stay in memory only |
| 3 | A `wirexqa://seed?d=<base64url(JSON)>` link | Any field but `ownerKey`. A link that carries `ownerKey` is refused whole: links travel in chats and QR codes, and a key never expires |

The other platforms read their first source their own way: iOS from the launch environment, Android from
intent extras, web from `.env.local`.

**The bearer.** A pasted `bearer` wins. Without one, the example signs
`I, owner of account <owner> confirm that I request access token for company <companyId> on chain <chainId> at <nonce>`
with `ownerKey` and posts it to `POST /api/v1/user/authorize`, with `X-Company-Id` and `X-Chain-Id`. The nonce
is the Unix time in seconds. The bearer it gets back stays in memory until a minute before it expires.

### Dev options
| Toggle | What it does |
|---|---|
| `Disable screen protection` | **DEV ONLY**: draws the revealed PAN/CVV on the iOS **Simulator** (the SDK's secure capture layer renders blank there). **Off by default** — leave off on a real device and in any shippable build; on it defeats PCI screen-capture protection. |

## What each surface needs

| Surface | What to enter |
|---|---|
| **Reveal** (PAN/CVV/expiry/PIN) | environment, chainId, bearer, actionToken, cardId |
| **Collect** (tokenize a card) | environment, chainId, bearer |
| **3DS step-up** | environment; a top-up orchestrator URL (the 3DS screen takes it directly — the SDK makes no call and needs no credentials) |
| **Wallet — Apple Pay / Google Pay** | environment, chainId, bearer, walletProvider, walletAmount/Currency; paste the estimation id + provider config on the Wallet screen |
| **Wallet — token mode** | the above + a `checkoutToken` your backend minted |
| **Trade** (stocks and coins) | environment, chainId, ownerKey; and a bearer, or companyId + baasApiUrl for the key login. A full trade runs on `production` only, and the example refuses one worth more than 10 USD |

## Credentials in a real integration

The example lets QA **paste** `bearer` and `actionToken` so a device needs no backend or wallet. A real
partner implements the credential provider instead:

- `getAccessToken()` → a bearer from the partner's auth against Wirex BaaS.
- `getActionToken(scope)` → the **user's wallet signature** over the confirmation action (`cardData`, `pin`).
- `userEmail` / `userWallet` → the identity headers.

`WirexThreeDS.configure({ testMode })` takes **no** credentials: the host authenticates to obtain the
orchestrator URL and hands it over.
