# Wirex Mobile SDK — integration context (for an AI assistant)

> Audience: an AI assistant helping a partner integrate `@wirexapp/mobile-sdk` (React Native).
> This file is the working context — read top to bottom; every fact is load-bearing.
> It is dense on purpose: no marketing. The human-facing version is `INTEGRATION.html`.
> It describes the SDK's public surface and the integrator's responsibilities. For the exact
> backend request/response shapes, defer to the Wirex BaaS API reference Wirex provides with the
> integration — this file does not restate them.

---

## 1. Mental model (the one thing to get right)

The SDK owns **sealed UI surfaces** and nothing else. Secrets (a revealed PAN/CVV, a typed card
number, a wallet payment token) live inside a native view or a Wirex-hosted web frame and **never cross
the JS bridge**. The SDK **never mints a credential, never stores one**, and (except where noted) **never
decides a money movement**.

The integrator supplies two things:

1. **Authentication** — via a `WirexCredentialProvider` the SDK calls on demand (bearer + step-up signature + identity header).
2. **Orchestration** — the partner **backend** prices and executes money-moving work (top-up pricing/execution, the 3DS URL, the wallet checkout token) and ships the provider config.

Each surface is one of:

| Surface | Needs credential provider? | What it does |
|---|---|---|
| Reveal | yes | show the cardholder their own PAN/expiry/CVV/PIN in sealed native rows |
| Collect | yes | capture an external card in a sealed native form and tokenize it at the acquirer |
| 3-D Secure | **no** | render the issuer challenge for a card payment; report the outcome |
| Wallet | yes | embed the Wirex-hosted Apple Pay / Google Pay checkout |

---

## 2. Who integrates, and exactly what they must have

**The integrator is a partner** issuing Wirex-backed cards to their own users. Checklist before any surface works:

Wirex assigns (per integration):
- `environment` — `test` or `production`. The SDK resolves all hosts from this; **no URLs are passed in**.
- `chainId` — the `X-Chain-Id` on every authenticated call.
- `clientId` — optional `?client=` on hosted pages (font-src / chain). Not auth.

Partner owns / must build:
- **A bearer** for the signed-in user, from the partner's auth against Wirex. → `getAccessToken()`.
- **A wallet step-up signature** capability (the user signs a confirmation message in their wallet; the partner backend exchanges it for a short-lived action token). → `getActionToken(scope)`.
- **The identity** of the user: ONE of email or EOA wallet address. → `userEmail` / `userWallet`.
- **A provisioned card** (card id) for Reveal/Collect.
- **Backend orchestration** for Wallet/Collect top-ups: price the top-up, execute it, (token mode) mint a checkout token, and obtain the 3DS URL from the execute/top-up response. These are Wirex BaaS API calls — see the BaaS API reference.
- **Provider config** for Wallet: the wallet provider block, shipped from the partner's own app config.

If any of the above is missing, name the specific one — the surfaces fail in predictable ways (see §8).

---

## 3. Install & native setup

```
# install from the package registry Wirex provides for your integration
yarn add @wirexapp/mobile-sdk
cd ios && pod install     # iOS
```
- React Native; iOS + Android. No Apple Pay **app entitlement** is required — wallet Apple Pay runs inside the Wirex web frame (WKWebView), not native PassKit.

---

## 4. Credential provider (the one object the partner implements)

```ts
import type { WirexCredentialProvider, WirexActionScope } from '@wirexapp/mobile-sdk';

const credentials: WirexCredentialProvider = {
  async getAccessToken(): Promise<string> { /* partner auth → Wirex bearer */ },
  async getActionToken(scope: WirexActionScope): Promise<string> { /* 'cardData' | 'pin' → action token */ },
  get userEmail(): string | undefined { /* return ONE of email / wallet */ },
  get userWallet(): string | undefined { /* the EOA address, if identifying by wallet */ },
};
```

Rules the SDK enforces / expects:
- **Exactly one identity header.** Returning both `userEmail` and `userWallet` makes the backend respond `400` ("multiple user identifiers"). Return one; the SDK forwards whichever is non-undefined.
- **The SDK sends the bearer as-is and does not retry a 401.** `getAccessToken` must check expiry and refresh; a stale token surfaces as a flat 401 that reads like "card rejected".
- `getActionToken(scope)` returns a step-up token: the user's **wallet signature** over a confirmation action, exchanged by the partner backend for a short-lived, one-shot token. Scopes: `cardData` (card details), `pin`.
- The provider is read **per call**, so a value refreshed mid-session takes effect on the next SDK call.

---

## 5. Surfaces — exact API

### 5.1 Reveal  (needs credentials)
```ts
import { WirexReveal, WirexRevealFieldView } from '@wirexapp/mobile-sdk';

await WirexReveal.configure({ testMode, chainId, credentials, logging: 'info',
  dangerouslyDisableScreenProtection: false }); // true draws the value on the iOS Simulator; never ship on
const session = await WirexReveal.createSession({ cardId, cardholderName, fields });
session.onSnapshot(setSnapshot);          // state: idle|loading|ready|error
await session.load();                     // fetch the values into the sealed view
// session.snapshot (current), session.destroy() (on teardown)
```
- `fields: WirexRevealField[]` ⊂ `'cardholderName' | 'pan' | 'expiry' | 'cvv' | 'pin'`. A virtual card has no PIN — omit `'pin'` unless it is a plastic card.
- Render one `WirexRevealFieldView` per field:
```tsx
<WirexRevealFieldView session={session} field="pan" strings={STRINGS} themeMode="dark"
  masked={masked} onMaskedChange={setMasked}
  onNaturalHeight={h => applyHeight(h)}   // REQUIRED for correct sizing — see §8
  onCopyResult={...} style={...} />
```
- The value is drawn in a secure capture-proof layer. On the **iOS Simulator** it renders **blank** — that is PCI protection, not a bug. `dangerouslyDisableScreenProtection: true` draws it for simulator development only.

### 5.2 Collect  (needs credentials)
```ts
import { WirexCollect, WirexCollectFormView } from '@wirexapp/mobile-sdk';

await WirexCollect.configure({ testMode, chainId, credentials, logging: 'info',
  dangerouslyDisableScreenProtection: false });
```
```tsx
<WirexCollectFormView profile="topup" themeMode="dark"
  onReady={h => (formHandle = h)} onChange={setState} style={...} />
// state: { brand, isComplete, fields: [{ field, isValid, isEmpty }] }
```
```ts
const token = await formHandle.tokenizeTopUp({
  billingDetails: { line1, zipCode, city, country },   // required by the tokenizer
});
// token: { brand, last4, expiryMonth, expiryYear }   — an opaque card token; PAN/CVV never cross JS
formHandle.clear();
```
- The **card user must be enrolled at the acquirer**; a non-enrolled user fails tokenization.
- After tokenizing, the **partner backend** funds the top-up (price → execute — see §6).

### 5.3 3-D Secure  (NO credentials)
```ts
import { WirexThreeDS, WirexThreeDSView } from '@wirexapp/mobile-sdk';

await WirexThreeDS.configure({ testMode, logging: 'info' });  // no credentials object
const session = await WirexThreeDS.createSession(url);          // url from the top-up execute response
await session.start();
const result = await session.settled();                         // resolves when the challenge settles
```
```tsx
<WirexThreeDSView session={session} style={StyleSheet.absoluteFill} />  // keep mounted full-size
```
- State: `idle | loading | challenge | settled`. Status: `completed | pending | failed | unknown`.
- `pending` = the payment is **not settled yet** — it is **not an error**. Reconcile the real outcome from the backend status feed, not the 3DS status alone.

### 5.4 Wallet  (needs credentials; real device only for the Pay sheet)
```tsx
import { WirexWalletCheckoutView, useWalletAvailability, WirexWalletAvailabilityProbe } from '@wirexapp/mobile-sdk';

<WirexWalletCheckoutView
  config={{ environment, clientId }}
  quote={{ estimationId, sourceAmount: { amount, currency } }}  // from a backend estimate
  providerConfig={providerBlock}        // the wallet provider block, VERBATIM
  provider={providerName}
  auth={tokenMode ? { checkoutToken } : undefined}
  onEvent={handleEvent} />
```
- Arms **automatically** when it has a valid `quote` + `providerConfig`. A new quote re-arms it.
- Availability (whether to show a Pay button):
  - `useWalletAvailability(config, { providerConfig })` returns `{ applePay, googlePay } | null` — **it only listens**.
  - You **must also mount** `<WirexWalletAvailabilityProbe config={config} providerConfig={providerBlock} />` on the same surface; it runs native `canMakePayments`. Without it mounted, the hook stays `null` forever. The probe needs a **real** provider block (with its probe URL); an empty block never resolves. On the iOS Simulator it never resolves (no Secure Element).
- Events (`onEvent`): `ready`, `naturalHeight`, `sheetOpen`, `cancelled`, `attemptFailed{reason}`, `estimationExpired`, `token{token}` (legacy), `executing`/`executed{result}`/`executeFailed{error}` (token mode), `failed{error}`, `diagnostic`, `debug`.
- **Legacy vs token mode:**
  - Legacy (no `auth`): the sheet tokenizes → `token` event → **partner backend** executes with that token.
  - Token mode (`auth.checkoutToken`): the frame executes itself → `executing`/`executed`/`executeFailed`; nothing crosses JS. The `checkoutToken` is minted by the backend and is independent of any specific estimation.

---

## 6. Backend orchestration (what the SDK does NOT do)

The partner backend owns these, using the Wirex BaaS API with the credentials Wirex issues. The SDK
consumes their results; it makes none of these calls. See the Wirex BaaS API reference for exact paths,
parameters and response shapes.

- **Price a top-up** → returns an `estimationId` + the fiat `sourceAmount`, for the funding instrument (external card, Apple Pay, or Google Pay). The priced quote has a short TTL; re-price to re-arm an expired checkout.
- **Execute a top-up** → settles it; for a card payment it returns a **3DS orchestrator URL** that you pass to `WirexThreeDS.createSession(url)`.
- **Mint a checkout token** (token mode only) → the `checkoutToken` for Wallet; it is scoped to the top-up flow and is independent of a specific estimation.
- **Provider config** → the wallet provider block, served from your app config and passed to Wallet verbatim.

Key relationship: the `estimationId` and the `checkoutToken` are **two independent values** — the id is
not derived from the token. The backend selects the correct settlement token when pricing; the app never does.

---

## 7. Invariants & gotchas (each one is a real failure mode)

- **One identity header.** email XOR wallet; both → 400.
- **Bearer expiry.** `getAccessToken` must refresh; the SDK does not retry 401.
- **`estimationId` ≠ `checkoutToken`.** Independent values from independent backend calls.
- **Reveal/Collect row sizing.** The native field reports its content height via `onNaturalHeight`; the host must apply it. A box pinned shorter than the content **clips** the value (recent SDK) — older builds collapsed it to height 0 and drew nothing. Do not hardcode a row height.
- **Wallet availability needs the probe mounted.** `useWalletAvailability` only listens; mount `WirexWalletAvailabilityProbe` with a real provider block or the hook stays `null` and the UI reads "unavailable" falsely.
- **Simulator limits.** iOS Simulator: Reveal/Collect secure layer renders blank; the wallet availability probe never resolves; the Apple Pay sheet cannot present. Use a real device for the Pay sheet.
- **Collect needs an acquirer-enrolled user**, else tokenization fails.
- **3DS `pending` is not an error.** Settle by backend status.
- **`providerConfig` is passed verbatim.** Do not re-case, default, or strip fields; an absent `apple_pay`/`google_pay` key means "do not offer".
- **Captured cards (Collect):** `expiry_year` 4-digit, ≥ current year; card label ≥2 Latin characters (tokenizer rules).

---

## 8. The runnable example

The SDK ships a runnable example that exercises all four surfaces against the partner's own data;
nothing is hard-coded. Its **Config** tab is a form over every integration parameter and credential
(bearer, action token, checkout token, identity, card id, chain, provider config); every screen reads
them live, so one build covers every surface with no rebuild. The field set is the same across the iOS,
Android and Flutter examples (field reference: the example's `PARTNER-CONFIG.md`).

---

## 9. Quick decision rules (for answering integrator questions)

- "Which surface needs credentials?" → Reveal, Collect, Wallet yes; 3DS no.
- "Where does the `estimationId` come from?" → the partner **backend** prices the top-up; the SDK only consumes the id. Not from any token.
- "Legacy or token mode for Wallet?" → token mode (backend mints `checkoutToken`) keeps the sheet payload off the device; legacy returns a `token` the backend executes. Both need a backend.
- "Why is the Pay button missing / 'unavailable'?" → probe not mounted, empty provider block, simulator, or no provisioned card.
- "Why is a revealed field blank?" → simulator (secure layer) OR the host ignored `onNaturalHeight`.
- "Why does Collect fail to tokenize?" → the user is not enrolled at the acquirer.
- "Does Wallet work on the simulator?" → the checkout arms, but the Apple/Google Pay sheet needs a real device.
