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

## Trade: a test trade from a local build

The **Trade** tab runs a real stock or coin trade. A full trade runs on `production` only, with small
real amounts, and the tab refuses a trade worth more than 10 USD there. A tester runs it from a local
debug build; no Firebase build carries a key.

1. **Prefill the config.** Copy `e2e.local.example.json` to `e2e.local.json` and fill in `environment`,
   `chainId`, `companyId`, `baasApiUrl` (the api-business host, without `/api`) and `ownerKey`, the test
   user's key exported from the company's web app.
   - The file is gitignored. Only a debug build reads it: a release bundle and any CI build get an empty
     module in its place.
   - Its values win over the Config tab and a seed link. A seed link never carries `ownerKey`.
   - With no `bearer`, the app gets one from the key through `POST /api/v1/user/authorize`. A pasted
     `bearer` wins.
2. **Start Metro on this machine only:** `npm run start:e2e`. The dev bundle carries the file's key, and
   plain `npm run start` serves it to the whole network. On an Android device, run
   `adb reverse tcp:8081 tcp:8081` first. A physical iPhone cannot reach 127.0.0.1: leave `ownerKey` out
   of the file and paste it on the Config tab, which keeps it in memory only.
3. **Inject the endpoints into the native SDKs built from source.** The `Trade` surface builds from the
   local `baas-ios-sdk` and `baas-android-sdk` until its release. Their checked-in endpoint tables are
   empty, so a build from them refuses to send. In each checkout, before building the app:

   ```sh
   node tools/inject-endpoints.mjs
   ```

   It fills `production` and `test` with the script's defaults; a `WIREX_<NAME>_API_URL` (or
   `_CARD_SERVICE_URL`, `_FRAMES_URL`, `_THREEDS_ORIGIN`) in the environment overrides one. Afterwards,
   `node tools/inject-endpoints.mjs --empty` puts the empty table back, so nothing reaches a commit there.
4. **Link the SDK from source.** With `baas-rn-sdk`, `baas-ios-sdk` and `baas-android-sdk` checked out
   beside this repository (or `WIREX_RN_SDK` pointing at `baas-rn-sdk`):

   ```sh
   npm run sdk:local                       # links the local binding; package.json and the lock stay as they are
   cd ios && cp Podfile.lock /tmp/Podfile.lock.keep && \
     WIREX_SDK_FROM_SOURCE=1 WIREX_IOS_SDK=../../../baas-ios-sdk pod install && cd ..
   npm run ios
   ```

   On Android, publish the SDK from source into a folder of your choosing, never `~/.m2`, where another
   build could take it for a released version. Then build against it:

   ```sh
   export WIREX_SDK_REPO=/path/of/your/choice/wirex-sdk-repo
   export WIREX_ANDROID_SDK=$PWD/../../baas-android-sdk     # its VERSION names the version to use
   (cd "$WIREX_ANDROID_SDK" && ./gradlew :mobile-sdk:publishToMavenLocal -Dmaven.repo.local="$WIREX_SDK_REPO")
   npm run android
   ```

   Without `WIREX_ANDROID_SDK`, set `WIREX_SDK_VERSION` to the version you published. With
   `WIREX_SDK_REPO` unset, the build takes the published SDK as before.

   The local pod writes its path into `ios/Podfile.lock`: copy the saved one back before you commit
   anything. `npm run sdk:published` returns to the published package. The Metro and TypeScript configs
   follow whichever one is installed.
5. Open **Trade** and follow the panels top to bottom: read or set up the account, load the catalog (a
   tap fills the quote), get a quote, execute, and resume an open order after killing the app.

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
| `RevealScreen` / `CollectScreen` / `ThreeDSScreen` / `WalletScreen` / `TradeScreen` | one surface each |
| `testSigner.ts` | **testing only**: signs with the test user's key (`@noble/secp256k1`) |
| `keyLogin.ts` | **testing only**: the bearer from the key, through the wallet-signature login |
| `tradeGuards.ts` | the 10 USD cap on `production` |
| `tradeSdk.ts` | the one `Trade` built from the Config tab, with the test signer and the bearer |
| `tradeView.ts` | the error line, the step log line and the screen's number formatting |
| `e2eLocal.ts`, `e2e.local.example.json` | the debug-only tester file and its template |
| `App.tsx` | the tab shell |
| `../PARTNER-CONFIG.md` | the field contract (shared by the iOS / Android / Flutter examples) |
