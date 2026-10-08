# @wirexapp/mobile-sdk

Wirex card and wallet features for a React Native app. The card values stay in native views and never
cross the JavaScript bridge.

- **Reveal** (`WirexReveal`, `WirexRevealFieldView`) shows cardholders their own card number, expiry,
  CVV and PIN.
- **Collect** (`WirexCollect`, `WirexCollectFieldView`, `WirexCollectFormView`) takes a card the user
  is entering and returns a token in place of the card values.
- **Wallet top-up** (`WirexWalletCheckoutView`, `WirexWalletAvailabilityProbe`) hosts the Wirex
  checkout with Apple Pay and Google Pay.

Use of the SDK requires an agreement with Wirex. See [LICENSE](LICENSE).

## Requirements

- React Native 0.72 or later, with the New Architecture.
- `react-native-webview` 13.15 or later, for the wallet.
- iOS 13 or later; Android 6.0 (API 23) or later.

## Installation

```sh
npm install @wirexapp/mobile-sdk react-native-webview
```

The native SDK is installed with the package: the `WirexMobileSDK` pod from CocoaPods trunk on iOS,
and `com.wirexapp.baas:mobile-sdk` from Maven Central on Android, both at the package's own version.
The Android project needs `mavenCentral()` among its repositories, which React Native templates
already include.

In an Expo app, add the config plugin to `app.json` or `app.config.ts`:

```json
{ "plugins": ["@wirexapp/mobile-sdk"] }
```

It raises the iOS and Android minimum versions where they are lower than the SDK's, and adds the
Android `<queries>` that Google Pay needs on Android 11 and later.

## Environments

The SDK supports two environments, `production` and `test`, and the same two apply to every surface.
The card surfaces take `testMode`; the wallet takes the environment by name. The native SDK holds the
addresses, and no API takes a URL. An unknown name is an error: the SDK never falls back to another
environment.

The card surfaces also need the chain ID of the partner's integration, passed as `chainId` when they
are configured.

## Credentials

The SDK never issues credentials. The host supplies a `WirexCredentialProvider`, which returns the
user's access token, an action token for each scope the SDK asks for, and the user's email and wallet
address. The SDK asks for a token when it needs one.

## Documentation

Every exported type and member is documented in the package's TypeScript declarations, which editors
show inline.
