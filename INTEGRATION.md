# Wirex Mobile SDK for React Native — Integration Guide

One npm package, four sealed surfaces: card **Reveal**, card **Collect**, **3-D Secure** and **Wallet** top-up with Apple Pay and Google Pay. Card values stay in native views and never cross the JavaScript bridge. Every snippet below is type-checked against `@wirexapp/mobile-sdk` 0.3.14.

<!-- badges: React Native · TypeScript | @wirexapp/mobile-sdk 0.3.14 · npm | Reveal · Collect · 3-D Secure · Wallet -->

## 1. What the SDK does

The SDK owns **sealed UI surfaces** and nothing else. A revealed card number, a card the user is typing and a wallet payment token live inside a native view or a Wirex-hosted web frame and **never reach JavaScript**. The SDK never mints a credential, never stores one, and never moves money on its own.

Your app supplies two things:

- **Authentication.** A credential provider the SDK calls on demand: the user's bearer, a step-up action token when card data or PIN is read, and the user's identity.
- **Orchestration.** Your backend prices and executes money-moving calls through the Wirex BaaS API (top-up estimate and execute, the 3-D Secure URL, the wallet checkout token) and ships the wallet provider config. The SDK renders the result and reports events back.

| Surface | Credentials | What it does |
|---|---|---|
| Reveal | yes | Shows the cardholder their own PAN, expiry, CVV and PIN in sealed native rows. |
| Collect | yes | Captures an external card in a sealed native form and tokenizes it at the acquirer. |
| 3-D Secure | **no** | Renders the issuer challenge for a card payment and reports the outcome. |
| Wallet | yes | Embeds the Wirex-hosted Apple Pay / Google Pay checkout for a backend-priced top-up. |

:::diagram model Apple/Google Pay

## 2. Requirements and install

- **React Native 0.74 or later with the New Architecture enabled.** The modules are TurboModules; the old architecture is not supported.
- **React 18 or later**, Node 18 or later.
- **iOS 15 or later**, Xcode 26.5 or later. **Android 6.0 (API 23) or later**, `mavenCentral()` among your repositories (React Native templates already have it).
- Expo: a development build is required. Expo Go cannot load native modules.

```sh
npm install @wirexapp/mobile-sdk@0.3.14
cd ios && pod install
```

The native SDKs are installed with the package: the `WirexMobileSDK` pod from CocoaPods trunk and `com.wirexapp.baas:mobile-sdk` from Maven Central, both at the package's own version.

```json
{ "expo": { "plugins": ["@wirexapp/mobile-sdk"] } }
```

The Expo config plugin raises the platform minimums where they are lower and adds the Android `<queries>` intents Google Pay needs on Android 11 and later. A bare React Native app adds them by hand to `AndroidManifest.xml`:

```xml
<queries>
  <intent><action android:name="org.chromium.intent.action.PAY" /></intent>
  <intent><action android:name="org.chromium.intent.action.IS_READY_TO_PAY" /></intent>
  <intent><action android:name="org.chromium.intent.action.UPDATE_PAYMENT_DETAILS" /></intent>
</queries>
```

Wirex assigns these values per integration. Everything else is your user's data.

| Value | What it is | Where it goes |
|---|---|---|
| `testMode` / `environment` | The card surfaces take `testMode` (`false` = production, `true` = the Wirex test environment). The wallet takes the same choice by name: `environment: 'production'` or `'test'`. The SDK holds the hosts; no API takes a URL. | `WirexReveal.configure`, `WirexCollect.configure`, `WirexThreeDS.configure`; `WirexWalletConfig.environment`. |
| `chainId` | The chain your integration operates on, sent as `X-Chain-Id` on every authenticated call. Required for Reveal and Collect. | `chainId` in `configure(...)`. |
| `clientId` | **Optional, wallet only.** A partner id that selects your branding and configuration on the Wirex-hosted checkout pages. Wirex tells you if you have one; most integrations do not. It is not a credential and grants nothing. | `WirexWalletConfig.clientId`; omit unless Wirex gave you one. |

## 3. Credential provider

One object you implement. The SDK calls it when it needs a token, so you never push tokens in advance.

```tsx
import { WirexDeclined, type WirexActionScope, type WirexCredentialProvider } from '@wirexapp/mobile-sdk';

declare function fetchAccessToken(): Promise<string>;
declare function fetchActionToken(scope: WirexActionScope): Promise<string>; // 'cardData' | 'pin'
declare function userConfirmedStepUp(): Promise<boolean>;

export const credentials: WirexCredentialProvider = {
  getAccessToken: () => fetchAccessToken(),            // bearer for the signed-in user
  async getActionToken(scope) {
    if (!(await userConfirmedStepUp())) throw new WirexDeclined(); // the user said no: not an error
    return fetchActionToken(scope);                     // short-lived step-up token from your backend
  },
  userEmail: 'user@example.com',                        // return ONE of userEmail / userWallet
  userWallet: undefined,
};
```

- **Exactly one identity.** Set either `userEmail` or `userWallet`. Sending both is a backend `400`.
- **The SDK sends the bearer as-is and does not retry a 401.** Check expiry in `getAccessToken` and refresh before returning.
- `getActionToken(scope)` is the step-up for reading card data (`'cardData'`) or the PIN (`'pin'`). Throw `new WirexDeclined()` when the user backs out; the SDK stops the operation and reports it as declined.
- Collect needs no action token: a `WirexCollectCredentialProvider` has only `getAccessToken` and the identity, and a full provider satisfies it too.
- `WirexReveal.setIdentity(userEmail, userWallet)` and `WirexCollect.setIdentity(...)` change the identity without reconfiguring.

## 4. Reveal {creds}

Shows the cardholder their own card details. Each field is a `WirexRevealFieldView`; the native side draws the value inside it.

```tsx
import * as React from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  WirexReveal, WirexRevealFieldView,
  type WirexCredentialProvider, type WirexRevealField, type WirexRevealMaskedState, type WirexRevealSession, type WirexRevealSnapshot,
} from '@wirexapp/mobile-sdk';

declare const credentials: WirexCredentialProvider;

export async function openReveal(cardId: string): Promise<WirexRevealSession> {
  await WirexReveal.configure({ testMode: true, chainId: '<chain id>', credentials });
  return WirexReveal.createSession({ cardId, fields: ['pan', 'expiry', 'cvv', 'pin'], cardholderName: 'JANE DOE' });
}

export function RevealRow({ session, field }: { session: WirexRevealSession; field: WirexRevealField }) {
  const [snapshot, setSnapshot] = useState<WirexRevealSnapshot>(session.snapshot);
  const [height, setHeight] = useState<number | undefined>();

  useEffect(() => {
    const unsubscribe = session.onSnapshot(setSnapshot);
    void session.load();                                  // idempotent; failures land in the snapshot
    return () => { unsubscribe(); void session.destroy(); };
  }, [session]);

  return (
    <View>
      <WirexRevealFieldView
        session={session}
        field={field}
        strings={{ fieldLabels: { pan: 'Card number' }, copy: 'Copy', copied: 'Copied' }}
        onNaturalHeight={setHeight}                       // measure, don't guess
        onMaskedChange={(s: WirexRevealMaskedState) => void s.masked}
        style={{ height }}
      />
      {snapshot.state === 'error' ? null : null}
    </View>
  );
}
```

- `fields` are `WirexRevealField` values: `'cardholderName' | 'pan' | 'expiry' | 'cvv' | 'pin'`. Omit `'pin'` for a virtual card.
- `PAN`, `CVV` and `PIN` start **masked**. Control it with the `masked` prop; `onMaskedChange` reports `{ masked, revealRequested, screenshotProtectionActive }`. Rows re-mask when detached unless `masksWhenDetached={false}`.
- Session state is `snapshot.state`: `'idle' | 'loading' | 'ready' | 'error'`. Per-field results are `snapshot.fields[i].outcome` (`'idle' | 'loading' | 'loaded' | 'failed'`) plus the `snapshot.loaded` and `snapshot.failed` arrays, so one failed field does not hide the others.
- `session.load()` resolves with the snapshot and never rejects for a request failure; `refresh()` reloads, `clear()` wipes values, `destroy()` releases the native session. `WirexReveal.destroyAll()` tears down everything.
- `onCopyResult(copied)` fires when the user copies a copyable field. There is no JavaScript-triggered copy.

> **Gotcha · sizing** A native row cannot be sized from JavaScript. It reports its content height through `onNaturalHeight`; apply it to the row. A box shorter than the content clips the value.

> **Note · simulator** The value is drawn in a secure, capture-proof layer that the iOS Simulator renders blank. That is the PCI protection working. For simulator development only, pass `dangerouslyDisableScreenProtection: true` to `configure(...)`. Never ship it on.

## 5. Collect {creds}

Captures a card the user is entering. The form is one native view; JavaScript receives a token, never the PAN or CVV.

:::flow Collect: user types the card | SDK tokenizes at the acquirer | your backend: estimate | execute → 3-D Secure URL

```tsx
import * as React from 'react';
import { useRef, useState } from 'react';
import {
  WirexCollect, WirexCollectFormView,
  type WirexCollectCredentialProvider, type WirexCollectFormHandle, type WirexCollectState, type WirexTopUpCardToken,
} from '@wirexapp/mobile-sdk';

declare const credentials: WirexCollectCredentialProvider;

export const configureCollect = () => WirexCollect.configure({ testMode: true, chainId: '<chain id>', credentials });

export function TopUpForm({ onToken }: { onToken: (t: WirexTopUpCardToken) => void }) {
  const form = useRef<WirexCollectFormHandle | null>(null);
  const [state, setState] = useState<WirexCollectState | null>(null);

  const submit = async () => {
    if (!form.current || !state?.isComplete) return;
    const token = await form.current.tokenizeTopUp({
      billingDetails: { line1: '1 Main St', zipCode: 'SW1A 1AA', city: 'London', country: 'GB' },
      label: 'My card',
    });
    onToken(token);   // { cardId, brand, bin, last4, expiryMonth, expiryYear }
  };
  void submit;

  return (
    <WirexCollectFormView
      profile="topup"
      strings={{ labels: { number: 'Card number' }, errors: { '*': { incomplete: 'Required' } } }}
      onReady={(handle: WirexCollectFormHandle) => { form.current = handle; }}
      onChange={setState}                                 // state.isComplete, state.brand, state.fields
      style={{ width: '100%' }}
    />
  );
}
```

- Profiles: `'topup'` (fund a top-up with this card) and `'oct-destination'` (register a payout card via `form.tokenizeOctDestination({ cardLabel, isSaved, isThirdParty })`, which returns `externalCardId`).
- `WirexCollectState` carries `isComplete`, `brand` (`'Visa' | 'MasterCard' | 'unknown'`) and per-field `fields` with `isValid` and `error` (`'incomplete' | 'invalid' | 'expired' | null`).
- Billing details (`line1`, `zipCode`, `city`, `country` as ISO alpha-2) are required by the tokenizer; `line2` and `state` are optional. The **card user must be enrolled at the acquirer**, otherwise tokenization rejects.
- After tokenizing, **your backend** prices and executes the top-up with the `cardId`; a card payment may return a 3-D Secure URL for the next section.
- To lay fields out yourself, create a headless form with `WirexCollect.createForm({ profile })` and render one `WirexCollectFieldView form={handle} field="number"` per field; `errorLine` (`'hidden' | 'reserved' | 'animated'`) controls where validation messages render. The form view sizes itself from the native content.

## 6. 3-D Secure {nocreds}

Presents the issuer challenge for a card payment. Your backend obtains the orchestrator URL from the top-up execute response; the SDK renders the flow and reports the outcome. No credentials are needed.

```tsx
import * as React from 'react';
import { StyleSheet } from 'react-native';
import { WirexThreeDS, WirexThreeDSView, type WirexThreeDSOutcome, type WirexThreeDSSession } from '@wirexapp/mobile-sdk';

export async function runStepUp(orchestratorUrl: string, mount: (s: WirexThreeDSSession) => void): Promise<WirexThreeDSOutcome> {
  await WirexThreeDS.configure({ testMode: true });
  const session = await WirexThreeDS.createSession(orchestratorUrl);
  mount(session);                                         // render <StepUpView session={session} /> full-size
  await session.start();
  const outcome = await session.settled();                // { status, error? }
  await session.destroy();
  return outcome;
}

export const StepUpView = ({ session }: { session: WirexThreeDSSession }) => (
  <WirexThreeDSView session={session} strings={{ title: 'Verify your card', close: 'Close', loading: 'Loading' }} style={StyleSheet.absoluteFill} />
);
```

| State (`snapshot.state`) | Outcome status | Outcome error code |
|---|---|---|
| `'idle'` · `'loading'` · `'challenge'` · `'settled'` | `'completed'` · `'pending'` · `'failed'` · `'unknown'` | `'originRefused'` · `'declined'` · `'unavailable'` |

- Keep the view mounted full-size for the life of the session; `session.onSnapshot` reports `state` and `isChallengeVisible`. `cancel()` settles with `'unknown'`.
- A refused URL comes back already settled with `originRefused`.

> **Note** `pending` means the payment is not settled *yet*; it is not an error. Reconcile the real result from your backend's status feed, not from the 3-D Secure status alone.

## 7. Wallet · Apple Pay / Google Pay {creds|device}

Embeds the Wirex-hosted checkout for a top-up your backend has already priced. The frame renders the quote and the wallet button; the Pay sheet is native. No Apple Pay entitlement or merchant identifier is needed in your app.

Three inputs, all from your backend and your app config:

| Input | What it is |
|---|---|
| `quote` | `estimationId` + `sourceAmount` from your backend's top-up estimate. Short TTL; passing a new quote re-arms the checkout. |
| `providerConfig` | The wallet provider block from your app config, passed **verbatim** as an object. |
| `auth` | Token mode: `{ checkoutToken }` your backend minted for this top-up flow. Omit it for legacy mode. |

:::diagram wallet

```tsx
import * as React from 'react';
import {
  WirexWalletAvailabilityProbe, WirexWalletCheckoutView, useWalletAvailability,
  type WirexWalletCheckoutEvent, type WirexWalletConfig, type WirexWalletProviderConfig, type WirexWalletQuote,
} from '@wirexapp/mobile-sdk';

const config: WirexWalletConfig = { environment: 'test' };   // clientId only if Wirex gave you one

export function PayButtonGate({ providerConfig }: { providerConfig: WirexWalletProviderConfig }) {
  const availability = useWalletAvailability(config, { providerConfig });   // { applePay, googlePay } | null
  return (
    <>
      <WirexWalletAvailabilityProbe config={config} providerConfig={providerConfig} />
      {availability?.applePay || availability?.googlePay ? null : null}     // show your Pay entry point here
    </>
  );
}

export function Checkout({ quote, providerConfig, provider, checkoutToken }: {
  quote: WirexWalletQuote; providerConfig: WirexWalletProviderConfig; provider: string; checkoutToken?: string;
}) {
  const onEvent = (event: WirexWalletCheckoutEvent) => {
    switch (event.type) {
      case 'ready': case 'sheetOpen': case 'cancelled': case 'executing': return;
      case 'naturalHeight': return void event.height;      // apply to the view's style
      case 'attemptFailed': return void event.reason;
      case 'estimationExpired': return;                     // re-price on your backend, pass a new quote
      case 'token': return void event.token.walletPaymentToken; // legacy mode: your backend executes
      case 'executed': return void [event.result.id, event.result.status];
      case 'executeFailed': return void event.error.reason;
      case 'failed': return void event.error.kind;
      case 'diagnostic': case 'debug': return;
    }
  };
  return (
    <WirexWalletCheckoutView
      config={config}
      quote={quote}                                       // { estimationId, sourceAmount: { amount: '10.00', currency: 'EUR' } }
      providerConfig={providerConfig}
      provider={provider}
      auth={checkoutToken ? { checkoutToken } : undefined}
      onEvent={onEvent}
      style={{ width: '100%' }}
    />
  );
}
```

- **Legacy vs token mode.** Without `auth`, the sheet tokenizes and the checkout emits `token`; your backend executes the top-up with it. With a backend-minted `checkoutToken`, the frame executes itself and emits `executing` → `executed` or `executeFailed`; nothing sensitive reaches JavaScript.
- `estimationId` and `checkoutToken` are two independent values from two backend calls; the id is not derived from the token.
- Re-arming: there is no imperative API. Pass a new `quote` (and in token mode a fresh `auth`) and the view re-arms.
- Events (`event.type`): `ready`, `naturalHeight`, `sheetOpen`, `cancelled`, `attemptFailed`, `estimationExpired`, `token`, `executing`, `executed`, `executeFailed`, `failed`, `diagnostic`, `debug`.
- `providerConfig` is passed verbatim. Do not re-case keys or add defaults; an absent `apple_pay` or `google_pay` key means "do not offer". `resolveWalletProviderBlock(topup, provider)` picks the block out of your app config.
- Standalone launch in a Chrome Custom Tab or auth session: `buildWalletLaunchUrl(config, { checkoutToken, quote, provider, returnUrl })` builds the URL your app opens; `isWalletReturnLink(url, returnUrl)` and `parseWalletReturnLink(url)` read the result on return.

> **Gotcha · availability** Mount a `WirexWalletAvailabilityProbe` with the real provider block and read `useWalletAvailability` before you show a Pay button; it reports the native `canMakePayments` answer. On the iOS Simulator it reports unavailable, and the Pay sheet cannot present. Test on a device with a provisioned card.

## 8. Appearance, strings and sizing

Every surface takes an appearance object and a strings object. The SDK ships no copy, so your app supplies every word the views draw.

```tsx
import type {
  WirexCollectStrings, WirexRevealAppearance, WirexRevealStrings, WirexThemeMode,
  WirexWalletAppearance, WirexWalletBranding, WirexWalletButtons,
} from '@wirexapp/mobile-sdk';

export const themeMode: WirexThemeMode = 'dark';          // a sibling prop on every card view
export const appearance: WirexRevealAppearance = {        // flat token map; the same names style Collect and 3-D Secure
  colorText: '#FFFFFF', colorLabel: '#9AA0B5', colorFocus: '#5753EA', colorBackground: '#1B1E2B',
  fontFamily: 'Inter', fontSizeBase: 16, fontWeightBase: 'medium', borderRadius: 8, controlMinHeight: 44,
};
export const revealStrings: WirexRevealStrings = { fieldLabels: { pan: 'Card number', cvv: 'CVV' }, maskedSegmentGlyph: '*', copy: 'Copy', copied: 'Copied' };
export const collectStrings: WirexCollectStrings = {
  labels: { number: 'Card number', expiry: 'Expiry', cvv: 'CVV' },
  errors: { '*': { incomplete: 'Required', invalid: 'Check this field' }, expiry: { expired: 'Card expired' } },
};
export const walletAppearance: WirexWalletAppearance = { theme: 'dark', variables: { '--wx-accent': '#5753EA' } };
export const walletButtons: WirexWalletButtons = { applePay: { style: 'black', type: 'top-up' }, googlePay: { color: 'black', type: 'pay' } };
export const walletBranding: WirexWalletBranding = { logo: 'hidden', processingDisclosure: { partnerName: 'Acme' } };
```

- Card surfaces take `themeMode` (`'light' | 'dark'`, default light) and a flat `appearance` map: colours (`colorText`, `colorLabel`, `colorPlaceholder`, `colorError`, `colorFocus`, `colorBackground`, `colorBorder`, `surfaceColor`), typography (`fontFamily`, `fontSizeBase`, `fontSizeLabel`, `lineHeightBase`, `lineHeightLabel`, `fontWeightBase`, `fontWeightLabel`), geometry (`borderRadius`, `borderWidth`, `spacingUnit`, `paddingHorizontal`, `paddingVertical`, `spacingLabel`, `spacingError`, `iconSize`, `controlMinHeight`). Icons are any React Native image source: `WirexRevealIcons { copy, copied }`, `WirexCollectIcons { Visa, MasterCard }`, `WirexThreeDSIcons { close }`.
- Strings: `WirexRevealStrings` (field labels, `maskedPlaceholder` for plain fields, `maskedSegmentGlyph` drawn in every PIN cell while masked, default `'*'`, copy texts), `WirexCollectStrings` (labels, placeholders, per-field errors with a `'*'` default), `WirexThreeDSStrings { title, close, loading }`.
- Wallet: `appearance` passes CSS variables to the frame; `buttons` sets the Apple Pay `style`/`type` and Google Pay `color`/`type`; `branding` sets the logo (`'wirex' | 'hidden' | 'custom'` with a data-URI `logoImage`), the processing disclosure and a privacy URL; `strings` overrides the 11 labels of the checkout.
- **Sizing.** Reveal rows report `onNaturalHeight`; the collect form sizes itself; the wallet emits a `naturalHeight` event. Apply those heights instead of hardcoding them.

## 9. Logging, timeouts and errors

```tsx
import { WirexDeclined, WirexWalletEnvironmentUnavailable, WirexWalletLogging, type WirexRevealSnapshot, type WirexWalletConfig } from '@wirexapp/mobile-sdk';

export const revealConfigExtras = { logging: 'info' as const, timeouts: { requestSeconds: 15, resourceSeconds: 30 } };
export const walletConfig: WirexWalletConfig = { environment: 'test', logging: WirexWalletLogging.console('info') };

export const revealError = (s: WirexRevealSnapshot) => s.error ?? s.fields.find((f) => f.outcome === 'failed')?.error; // { code, retryable }
export const isDecline = (e: unknown) => e instanceof WirexDeclined;
export const envReason = (e: unknown) => (e instanceof WirexWalletEnvironmentUnavailable ? e.reason : null);     // 'unknownName' | 'notBuilt' | 'malformedEndpoints'
```

- Logging is off by default. The card surfaces and 3-D Secure take `logging: 'debug' | 'info' | 'warn' | 'error'` (iOS unified log, Android logcat tag `wirex`). The wallet takes `{ level, sink }`; without a sink nothing is written. Presets: `WirexWalletLogging.disabled`, `WirexWalletLogging.console(level)`. Every logged value passes a redactor.
- Timeouts are in seconds: `timeouts: { requestSeconds, resourceSeconds }` on Reveal and Collect; `requestSeconds` / `resourceSeconds` top-level on `WirexThreeDS.configure`.
- Reveal errors arrive **in the snapshot** (`{ code, retryable }`), never as a rejection of `load()`. Collect errors reject `tokenize*()` with `{ code, retryable, reason? }`; `reason` is `'cardAlreadyLinked'` or `'cardLimitReached'` when the backend says so. 3-D Secure and wallet errors arrive in the outcome and the `failed` event.
- `WirexDeclined` is the one shared error class: the user said no, and nothing was sent.
- An unknown wallet environment name throws `WirexWalletEnvironmentUnavailable`. Show the reason; never fall back to another environment.

## 10. Your backend

The SDK makes none of these calls. Your backend performs them with the partner credentials Wirex issued, and the app passes the results in:

- **Price a top-up** → `estimationId` and `sourceAmount` for the wallet quote. Short TTL; re-price to re-arm an expired checkout.
- **Execute a top-up** → settles it; a card payment returns the 3-D Secure orchestrator URL.
- **Mint a checkout token** (wallet token mode) → `checkoutToken`, scoped to the top-up flow.
- **Serve the wallet provider config** → the provider block the app passes to the wallet verbatim.

Authenticated calls carry `Authorization: Bearer`, `X-Chain-Id` and one identity header (`X-User-Email` or `X-User-Wallet`, never both). For exact paths and payloads see the Wirex BaaS API reference provided with your integration.

## 11. The example app

[`example/`](example/) is a React Native app that exercises all four surfaces against your own data; nothing is compiled in. Run `npm install`, `cd ios && pod install`, then `npm run ios` or `npm run android`. The **Config** tab is a per-field editor for the environment, the integration parameters (chain id, identity, card id, cardholder name) and the secrets (bearer, step-up action token); values live in memory only, and every screen reads them live. The **Wallet** screen takes an estimation id and the provider block, and its **Fetch estimate** button prices a top-up through the BaaS API with your bearer, so you can get a real estimation id without standing up a backend. The **Appearance** tab restyles every sealed surface at once. The field list is in [`PARTNER-CONFIG.md`](PARTNER-CONFIG.md). Reveal values render blank on the iOS Simulator and the Pay sheet needs a real device.

## 12. Patterns from a production integration

The SDK ships inside a production cardholder app built on the same BaaS API. The patterns below are not required by the API; they are what that integration settled on, with the app-specific parts removed.

### Credentials in practice

```tsx
import { WirexCollect, WirexReveal, WirexThreeDS, type WirexActionScope, type WirexCredentialProvider } from '@wirexapp/mobile-sdk';

declare const auth: {
  getAccessToken(): Promise<string | undefined>;
  refreshAccessToken(): Promise<string | undefined>;
  expiresAtMs(token: string): number | undefined;
  signAction(scope: WirexActionScope): Promise<string>;
  userEmail(): string | undefined;
  userWallet(): string | undefined;
};
const EXPIRY_BUFFER_MS = 30_000;

// Sign BEFORE the sheet opens and hand the token over one-shot: the user confirms once.
let offered: { scope: WirexActionScope; token: string } | undefined;
export const offerStepUpToken = (scope: WirexActionScope, token: string): void => { offered = { scope, token }; };
export const revokeOfferedStepUpToken = (): void => { offered = undefined; };

export const credentials: WirexCredentialProvider = {
  async getAccessToken() {
    // Expiry, not just presence: the SDK sends what it is given and never retries a 401.
    const token = await auth.getAccessToken();
    const expiresAt = token ? auth.expiresAtMs(token) : undefined;
    if (token && (expiresAt === undefined || expiresAt - Date.now() > EXPIRY_BUFFER_MS)) return token;
    const refreshed = await auth.refreshAccessToken();
    if (refreshed) return refreshed;
    if (token && expiresAt !== undefined && expiresAt > Date.now()) return token;   // inside the buffer, still valid
    throw new Error('no access token available');
  },
  async getActionToken(scope) {
    if (offered?.scope === scope) { const { token } = offered; offered = undefined; return token; }
    return auth.signAction(scope);                                 // fallback: sign now
  },
  get userEmail() { return auth.userEmail(); },
  get userWallet() { return auth.userWallet(); },
};

// Configure once per process; a failure clears the cache so the next attempt retries.
let configured: Promise<void> | undefined;
export const configureSdk = (testMode: boolean, dev: boolean): Promise<void> => {
  configured ??= (async () => {
    const logging = dev ? ('debug' as const) : ('warn' as const);
    const shared = { testMode, chainId: '<chain id>', credentials, logging };
    await Promise.all([WirexReveal.configure(shared), WirexCollect.configure(shared), WirexThreeDS.configure({ testMode, logging })]);
  })().catch((error: unknown) => { configured = undefined; throw error; });
  return configured;
};

// Identity is read once at configure time: push it again whenever the signed-in user changes.
export const syncIdentity = (): void => {
  WirexReveal.setIdentity(auth.userEmail(), auth.userWallet());
  WirexCollect.setIdentity(auth.userEmail(), auth.userWallet());
};
```

- **Check the bearer's expiry, not just its presence.** Your own API client probably refreshes on a 401 and retries; the SDK does neither. Use the same expiry buffer your client uses so the two agree on "about to expire", refresh before returning, and only fall back to a still-valid token when the refresh fails.
- **Sign once.** The user confirms a card reveal with a step-up *before* the sheet opens. Mint the action token there, offer it to the provider one-shot, and revoke it if the flow is abandoned. Otherwise the SDK asks for a second confirmation for the same action.
- **Configure once per process**, cached behind a promise or a flag, and clear the cache on failure so a later attempt can retry. Derive `testMode` from your *runtime* environment if your app can switch backends. Log at `debug` in development builds and `warn` in release.
- **Push identity on change.** The identity headers are read once at `configure` time and then live in the native client. Call `WirexReveal.setIdentity` / `WirexCollect.setIdentity` whenever the signed-in user or wallet changes, and only on a real change, so a store that updates often does not turn into bridge traffic.

### Reveal in practice

- **One session per open sheet, destroyed with it.** The session holds the retrieved values natively; leaving one alive after the sheet closes keeps a PAN in memory for nothing.
- **Unmask immediately when the user already confirmed.** After the step-up signature, render the rows with `masked={false}` instead of asking for another tap.
- **Log which fields failed together with the snapshot's error code.** The row shows only *that* a field failed, never why.

### Collect in practice

```tsx
import * as React from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { WirexCollect, WirexCollectFieldView, type WirexBillingDetails, type WirexCollectFormHandle, type WirexCollectState } from '@wirexapp/mobile-sdk';

/** Headless form, your own layout, your own billing-address cell; submit only when both are ready. */
export function NewCardForm({ billing, onToken }: { billing: WirexBillingDetails | null; onToken: (cardId: string) => void }) {
  const [form, setForm] = useState<WirexCollectFormHandle | null>(null);
  const [state, setState] = useState<WirexCollectState | null>(null);

  useEffect(() => {
    let handle: WirexCollectFormHandle | null = null;
    void WirexCollect.createForm({ profile: 'topup', onChange: setState }).then((h) => { handle = h; setForm(h); });
    return () => { if (handle) void WirexCollect.destroyForm(handle); };
  }, []);

  const canSubmit = Boolean(state?.isComplete) && billing !== null;
  const submit = async () => {
    if (!form || !billing) return;
    const token = await form.tokenizeTopUp({ billingDetails: billing });
    onToken(token.cardId);                                    // your backend prices and executes with it
  };
  void canSubmit; void submit;

  if (!form) return null;
  return (
    <View>
      <WirexCollectFieldView form={form} field="number" />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <WirexCollectFieldView form={form} field="expiry" style={{ flex: 1 }} />
        <WirexCollectFieldView form={form} field="cvv" style={{ flex: 1 }} />
      </View>
      <WirexCollectFieldView form={form} field="name" />
      {/* your own billing-address cell and card-label input go here */}
    </View>
  );
}
```

- The sealed rows replace only the card inputs. Keep your own billing-address entry and card label, enable submit on `isComplete` **and** a complete address, and release the form when the screen goes away.

### 3-D Secure in practice

```tsx
import type { WirexThreeDSOutcome, WirexThreeDSSession, WirexThreeDSStatus } from '@wirexapp/mobile-sdk';

type StepUpHandlers = {
  onError(message: string): void;
  onDismissed(): void;
  onComplete(status: WirexThreeDSStatus): void;
  onChallengeVisible(visible: boolean): void;
};

/** Settle exactly once, and tell the three endings apart. Returns the unsubscribe function. */
export function watchStepUp(session: WirexThreeDSSession, h: StepUpHandlers): () => void {
  let settled = false;
  const settle = (outcome: WirexThreeDSOutcome) => {
    if (settled) return;
    settled = true;
    if (outcome.error) return h.onError(outcome.error.message ?? outcome.error.code);   // show it
    if (outcome.status === 'unknown') return h.onDismissed();  // the user closed it: reconcile by backend status
    h.onComplete(outcome.status);                               // completed · pending · failed
  };
  return session.onSnapshot((snapshot) => {
    h.onChallengeVisible(snapshot.isChallengeVisible);          // hide your own header while true
    if (snapshot.state === 'settled' && snapshot.outcome) settle(snapshot.outcome);
  });
}
```

- Start the session only after the view is mounted; a challenge can appear within a frame of the page asking for one.
- Three endings, not interchangeable: an outcome with an `error` is shown; `unknown` *without* an error means the user closed the challenge, which is a decision, not a failure, and the payment may still complete; anything else is a real status. Reconcile the first two against your backend.

### Wallet top-up in practice

```tsx
import {
  buildWalletLaunchUrl, isWalletReturnLink, parseWalletReturnLink,
  type WirexWalletCheckoutAuth, type WirexWalletConfig, type WirexWalletQuote,
} from '@wirexapp/mobile-sdk';

/** One token per armed quote. A failed mint is not fatal in-app: run legacy mode instead. */
export async function armAuth(mint: () => Promise<string>): Promise<WirexWalletCheckoutAuth | undefined> {
  try { return { checkoutToken: await mint() }; } catch { return undefined; }
}

/** Custom Tab (Android, token mode only): your app opens the URL and watches for the return link. */
export type TabOutcome = { kind: 'executed'; status: 'completed' | 'pending' } | { kind: 'failed' } | { kind: 'unknown' };

export const launchUrl = (config: WirexWalletConfig, auth: WirexWalletCheckoutAuth, quote: WirexWalletQuote, provider: string, returnUrl: string): string =>
  buildWalletLaunchUrl(config, { checkoutToken: auth.checkoutToken, quote, provider, returnUrl });

export function readReturn(url: string | undefined, returnUrl: string, quote: WirexWalletQuote): TabOutcome {
  if (!url || !isWalletReturnLink(url, returnUrl)) return { kind: 'unknown' };          // tab closed without the link
  const back = parseWalletReturnLink(url);
  if (back.estimationId && back.estimationId !== quote.estimationId) return { kind: 'unknown' };
  switch (back.outcome) {
    case 'completed': case 'pending': return { kind: 'executed', status: back.outcome };
    case 'failed': return { kind: 'failed' };
    default: return { kind: 'unknown' };                                                 // already_executed or no outcome: reconcile by backend status
  }
}
```

- **One `checkoutToken` per armed quote.** Mint it on your backend for the quote you are about to arm; a re-arm mints again. Never hand the user's session bearer to the frame.
- **A failed mint is not fatal in-app.** Run legacy mode instead: the frame tokenizes and your backend executes. Keep `debug` off outside development builds.
- **Custom Tab is the partner path for Google Pay on Android** when your own WebView cannot complete it. Use an **https App Link** as `returnUrl` (a custom scheme can be claimed by any installed app), open the URL with an auth-session API such as `expo-web-browser`'s `openAuthSessionAsync(url, returnUrl)`, and treat every ending that is not `completed`, `pending` or `failed` as unknown: Android cannot close the tab for you, and a closed tab says nothing about the payment. A Custom Tab needs token mode; there is nobody to hand a wallet token to.

## 13. Troubleshooting

- **A revealed field is blank.** iOS Simulator (secure layer), or the row was given a height smaller than `onNaturalHeight` reported.
- **`configure` rejects with an environment error.** This build has no endpoints for that side, or `chainId` is empty.
- **Reveal or Collect fails with `unauthorized`.** The bearer is stale; `getAccessToken` must refresh. The SDK never retries a 401.
- **Collect cannot tokenize.** The user is not enrolled at the acquirer, or billing details are missing.
- **The Pay button is unavailable.** The probe is not mounted, the provider block is empty, or you are on the iOS Simulator.
- **3-D Secure ends in `pending`.** Not an error. Settle by your backend's status.
- **Both `userEmail` and `userWallet` are set.** The backend answers `400`. Return exactly one.
- **The native module is missing.** You are in Expo Go or on the old architecture. Build a development build with the New Architecture enabled.
