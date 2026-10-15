# Wirex Mobile SDK — React Native example

One app that exercises **every surface** of `@wirexapp/mobile-sdk` — card **Reveal**, card **Collect**,
the **3DS** step-up and **Wallet** top-up (Apple Pay / Google Pay, token mode) — against **any
partner's data**. Nothing is hard-coded: a **Config tab** lets you type the integration parameters and
credentials into the running build, and every screen reads them live.

## Install

The app depends on the published package `@wirexapp/mobile-sdk`:

```sh
npm install
npm run start           # Metro
npm run ios             # or: npm run android
```

`@wirexapp/mobile-sdk` installs from the public npm registry; its native iOS pod (`WirexMobileSDK`) and
Android artifact (`com.wirexapp.baas:mobile-sdk`) are resolved automatically by autolinking from
CocoaPods and Maven Central.

## Use it

1. Open the app — it starts on **Config**.
2. Type the values for the surface you want to test (see the table below, and `../PARTNER-CONFIG.md` for
   the full contract). Secrets (bearer, step-up token, checkout token) are held in memory only.
3. Switch to **Reveal / Collect / 3DS / Wallet**. Each screen reads the config live, so a re-pasted
   value takes effect on the next action — no rebuild.

| Surface | Fill in on Config |
|---|---|
| Reveal | environment, chainId, bearer, step-up action token, cardId |
| Collect | environment, chainId, bearer |
| 3DS | environment; then paste a top-up orchestrator URL on the 3DS screen |
| Wallet | environment, chainId, bearer, provider, amount/currency; a token mode checkout token; a return URL for the Custom Tab |

## How a partner integrates

The example is deliberately thin — the integration is three steps, the same on every platform:

1. `WirexReveal.configure({ environment, chainId, credentials })` (and `WirexCollect`, `WirexThreeDS`,
   the wallet view) — once.
2. Implement the **credential provider** (`exampleConfig.ts` shows the shape): `getAccessToken` (a Wirex
   bearer), `getActionToken(scope)` (the user's wallet signature for card data / PIN), and the identity.
3. Render the surface's component.

See `../PARTNER-CONFIG.md` for exactly what each surface needs and who supplies it.

## Files

| File | What |
|---|---|
| `exampleConfig.ts` | the runtime config model + the credential provider that reads it |
| `ConfigScreen.tsx` | the Config (debug) tab — the form |
| `RevealScreen` / `CollectScreen` / `ThreeDSScreen` / `WalletScreen` | one surface each |
| `App.tsx` | the tab shell |
| `../PARTNER-CONFIG.md` | the field contract (shared by the iOS / Android / Flutter examples) |
