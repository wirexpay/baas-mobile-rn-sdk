# Changelog

## Unreleased

- Trade: `createTrade({ environment, chainId, tokenProvider, signer })` buys and sells US stocks and coins from the user's account, with the members `account`, `setUpAccount`, `catalog`, `quote`, `execute`, `openOrders` and `resume`. The host signs each UserOp hash: only the 32-byte hash and the 65-byte signature cross the bridge, never the key. Errors are `TradeError` with a reason name.
- Example: a Trade tab with the panels Account, Catalog, Quote, Trade and Open orders. It signs with a test user's exported key, from a gitignored `e2e.local.json` in a debug build or from the Config tab, and gets its bearer through the wallet-signature login. It refuses a production trade worth more than 10 USD. A seed link never carries the key.
- Crypto: `createCrypto({ environment, chainId, tokenProvider, signer })` sends from the user's account to any address, on its own chain or another network, and makes deposit addresses. Its members are `balances`, `quoteSend`, `send`, `resumeSend`, `sendStatus`, `pendingSends` and `depositAddress`. It signs as `Trade` does, and errors are `CryptoError` with a reason name.
- Example: a Crypto tab with the panels Balances, Send, Pending and Deposit. Quotes are held in memory only, and a pending row resumes by its held quote's `requestHash`. On production it refuses a send worth more than 10 USD: USDC, USDT and WUSD count at face value, EURC and WEUR at ×1.25, and any other token is refused.

## 0.3.15

- 3-D Secure: `dangerouslyDisableScreenProtection` in `WirexThreeDS.configure()`, the same switch Collect has. Android applies no `FLAG_SECURE` while a challenge is on screen; iOS does not cover the page while the screen is recorded or mirrored. For automated UI tests and device clouds; off by default.
- Native SDKs 0.3.15.

## 0.3.14

- Wallet: never coalesce checkout events on Android, so the checkout box resizes correctly after the Google Pay button mounts (the button was cut and the privacy line hidden). iOS was unaffected.

## 0.3.13

Reveal
- A row masked when the app leaves the foreground keeps your reveal request and draws again on return, as long as the session still holds the value. Past the session's 120 s lifetime the row stays masked until you load again.
- A hidden segmented field (PIN) shows the masked placeholder's glyph in every cell instead of empty boxes.
- iOS floor is 15.0 on the pod.
- React Native 0.86 / Expo 57 supported: the Android bindings follow the host's event-dispatcher API.
- Android: PIN cells sized like iOS; card entry no longer leaks through a screen capture.
- Android: Reveal: PIN cells fill the row at `controlMinHeight` height in a host box of exactly that height: a blank label collapses and a field without a copy control gives the copy slot to the value.
- Reveal: new string `maskedSegmentGlyph`, drawn in every PIN cell while masked (default `*`; pass `•` for dots).

## 0.3.7

- 3-D Secure: presents the card issuer's authentication page a top-up asks for and reports the outcome.
- Wallet top-up: token mode. The checkout can execute the top-up itself and report executing / executed / failed instead of handing back a token. Standalone launch helpers build the checkout URL and parse the return link for hosts that open the checkout in a browser tab; the return link is matched at a path boundary.
- Privacy manifests ship with the iOS artifacts.
- The 3-D Secure bridge builds in hosts that link pods as static libraries.

## 0.3.1

First public release.

- Card reveal: shows a cardholder their own card number, expiry, CVV and PIN inside the host app.
- Card collect: takes a card the user is entering and returns a token.
- Wallet top-up: hosts the Wirex checkout with Apple Pay and Google Pay.
- One environment model for every surface: `production` and `test`.
