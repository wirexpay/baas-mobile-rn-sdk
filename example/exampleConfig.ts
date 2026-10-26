/**
 * The example's runtime configuration — everything a partner (or QA) types into the running build on
 * the Config tab, so one binary exercises every surface without a rebuild.
 *
 * TWO tiers, on purpose:
 *   - `settings`  — non-secret integration parameters (environment, chainId, clientId, the demo card
 *                   id, the wallet quote). Safe to show and to prefill.
 *   - `secrets`   — the bearer, the step-up action token, the wallet checkout token. Held in memory
 *                   ONLY, never logged, matching the SDK's own no-persistence promise. They reset when
 *                   the process dies; you re-enter them.
 *
 * Nothing here calls a backend. Each screen and the credential provider read through the getters so a
 * freshly typed value takes effect on the next call without remounting. In a real integration the host
 * mints these credentials from its own auth and the user's wallet; this example lets you paste them.
 */
import {Platform} from 'react-native';

import type {WirexActionScope, WirexCredentialProvider, WirexThemeMode} from '@wirexapp/mobile-sdk';

export type ExampleEnvironment = 'production' | 'test';

/** Non-secret integration parameters. Everything here is safe to display and prefill. */
export interface ExampleSettings {
  /** The SDK environment NAME. `test` maps to `testMode: true`; the SDK holds the hosts itself. */
  environment: ExampleEnvironment;
  /** `X-Chain-Id` — the chain the partner operates on. Wirex assigns it per integration. */
  chainId: string;
  /** Optional partner id for the hosted wallet pages. Only set it if Wirex gave you one. */
  clientId: string;
  /** Identity headers. The backend accepts exactly one — email OR wallet. */
  userEmail: string;
  userWallet: string;
  /** The card the Reveal / Collect screens act on. */
  cardId: string;
  cardholderName: string;
  /** Wallet top-up quote the Checkout screen arms with. */
  walletAmount: string;
  walletCurrency: string;
  /** The estimate's provider NAME; the frame resolves its block from the provider config by it. */
  walletProvider: string;
  /** Wallet: the estimation id the Checkout arms with (from "Fetch estimate", the kit, or a seed link). */
  estimationId: string;
  /** 3DS: the orchestrator URL (`three_ds_state.url`) the 3DS tab starts with. A seed link can carry it. */
  threeDsUrl: string;
  /** The Wirex BaaS API base URL, for the "Fetch estimate" helper on the Wallet tab. Pricing a top-up
   *  is your BACKEND's job; the helper calls the documented BaaS API with your bearer so you can
   *  verify the token and get a real estimationId without a backend. Wirex gives you the base for your
   *  environment. Leave blank if you paste an estimationId instead. */
  baasApiUrl: string;
  /** DEV/TEST ONLY: draw the revealed PAN/CVV on the iOS Simulator (the SDK's secure capture layer
   *  renders blank there). Off by default; never ship it on to cardholders. */
  devDisableScreenProtection: boolean;
}

/** Secrets — memory only, never persisted, never logged. */
export interface ExampleSecrets {
  /** Wirex bearer for the signed-in user (`getAccessToken`). */
  bearer: string;
  /** A step-up token for card data / PIN (`getActionToken`). In a real integration this is the user's
   *  wallet signature, exchanged by your backend; here you paste one so the device needs no wallet. */
  actionToken: string;
  /** TOKEN MODE: the short-lived top-up token your backend minted for the quote. */
  checkoutToken: string;
}

const DEFAULT_SETTINGS: ExampleSettings = {
  environment: 'test',
  chainId: '',
  clientId: '',
  userEmail: '',
  userWallet: '',
  cardId: '',
  cardholderName: '',
  walletAmount: '10.00',
  walletCurrency: 'EUR',
  walletProvider: '',
  estimationId: '',
  threeDsUrl: '',
  baasApiUrl: '',
  devDisableScreenProtection: false,
};

const settings: ExampleSettings = {...DEFAULT_SETTINGS};
const secrets: ExampleSecrets = {bearer: '', actionToken: '', checkoutToken: ''};

const settingsListeners = new Set<() => void>();
const notify = (): void => settingsListeners.forEach((fn) => fn());

/** Subscribe to any settings/secrets change (the Config screen writes, others re-read). */
export const onConfigChange = (fn: () => void): (() => void) => {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
};

export const getSettings = (): Readonly<ExampleSettings> => settings;
export const getSecret = (key: keyof ExampleSecrets): string => secrets[key];

export const setSetting = <K extends keyof ExampleSettings>(key: K, value: ExampleSettings[K]): void => {
  settings[key] = value;
  notify();
};

export const setSecret = (key: keyof ExampleSecrets, value: string): void => {
  secrets[key] = value;
  notify();
};

export const resetConfig = (): void => {
  Object.assign(settings, DEFAULT_SETTINGS);
  secrets.bearer = secrets.actionToken = secrets.checkoutToken = '';
  notify();
};

/** `test` everywhere but the production name. */
export const isTestMode = (): boolean => settings.environment !== 'production';

const SEED_SECRETS = new Set<string>(['bearer', 'actionToken', 'checkoutToken']);
/** The native examples name identity `wallet` / `email`; one seed link serves every platform. */
const SEED_ALIASES: Record<string, string> = {wallet: 'userWallet', email: 'userEmail', disableScreenProtection: 'devDisableScreenProtection'};

/**
 * Applies a `wirexqa://seed?d=<base64url(JSON)>` link — the deep link the example registers — from the
 * launch URL or from text pasted into the Config tab. Returns how many values were set, or null when the
 * text is not a seed link (other scheme, no `d`, undecodable). Any key the Config holds is applied, the
 * bearer and action token included; the payload is one base64 param (no `&`/`+` to mangle). A real
 * integration mints these from its own auth and the user's wallet; this only saves typing on a test
 * device — every value stays in memory only.
 */
export const applySeedLink = (url: string | null | undefined): number | null => {
  const text = (url ?? '').trim();
  // `wirexqa-rn://` is this example's own scheme (iOS opens ONE app per scheme, so each example has one);
  // `wirexqa://` is the shared one every example also registers.
  if (!/^wirexqa(-rn)?:\/\/seed/.test(text)) return null;
  try {
    const d = text.split('d=')[1]?.split('&')[0];
    if (!d) return null;
    const b64 = decodeURIComponent(d).replace(/-/g, '+').replace(/_/g, '/');
    const atob = (globalThis as unknown as {atob: (data: string) => string}).atob;
    const json = JSON.parse(atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4))) as Record<string, unknown>;
    let applied = 0;
    for (const [rawKey, value] of Object.entries(json)) {
      if (value == null || `${value}` === '') continue;
      const key = SEED_ALIASES[rawKey] ?? rawKey;
      if (SEED_SECRETS.has(key)) {
        secrets[key as keyof ExampleSecrets] = `${value}`;
      } else if (key in DEFAULT_SETTINGS) {
        (settings as unknown as Record<string, unknown>)[key] = key === 'devDisableScreenProtection' ? `${value}` === 'true' : `${value}`;
      } else {
        continue;
      }
      applied++;
    }
    notify();
    return applied;
  } catch {
    return null;
  }
};

/** display amount (e.g. "10.00") → base-units string (amount * 10^decimals), without float loss. */
function toBaseUnits(amount: string, decimals: number): string {
  const [whole, frac = ''] = amount.split('.');
  const scaled = `${whole}${(frac + '0'.repeat(decimals)).slice(0, decimals)}`.replace(/^0+/, '');
  return scaled || '0';
}

/**
 * Prices a wallet top-up with the Wirex BaaS API — the step your BACKEND owns in a real integration.
 * The example calls it with the bearer from the Config tab so you can verify your token and get a real
 * `estimationId` without standing up a backend. This is NOT something the SDK does; the SDK consumes
 * the id your backend produces. Endpoints are the documented Wirex BaaS API.
 *
 * Needs on the Config tab: BaaS API URL, bearer, chain id, ONE identity (wallet or email), wallet
 * amount + currency.
 */
export async function fetchTopUpEstimate(): Promise<string> {
  const base = settings.baasApiUrl.replace(/\/+$/, '');
  // https only: the bearer goes to whatever is typed here. The chain id is required by the API.
  if (!/^https:\/\//.test(base)) throw new Error('Set an https BaaS API URL on the Config tab');
  if (!settings.chainId) throw new Error('Set the chain id on the Config tab');
  const bearer = secrets.bearer;
  if (!bearer) throw new Error('Set a bearer on the Config tab');
  const identity: Record<string, string> | null = settings.userWallet
    ? {'X-User-Wallet': settings.userWallet}
    : settings.userEmail
      ? {'X-User-Email': settings.userEmail}
      : null;
  if (!identity) throw new Error('Set a user wallet or email on the Config tab');
  const headers = {
    Authorization: `Bearer ${bearer}`,
    'X-Chain-Id': settings.chainId,
    ...identity,
    'Content-Type': 'application/json',
  };

  // 1) settlement token for the wallet currency — GET /api/v1/config/tokens (documented).
  const toksRes = await fetch(`${base}/api/v1/config/tokens`, {headers});
  if (!toksRes.ok) throw new Error(`GET /config/tokens → HTTP ${toksRes.status}`);
  const toksBody = (await toksRes.json()) as {data?: TokenRow[]} | TokenRow[];
  const tokens: TokenRow[] = Array.isArray(toksBody) ? toksBody : toksBody.data ?? [];
  const cur = settings.walletCurrency;
  const token = tokens.find(
    (t) => (t.equivalent_symbols ?? []).includes(cur) || (t.symbol ?? '').endsWith(cur),
  );
  if (!token) throw new Error(`no settlement token for ${cur}`);

  // 2) price the top-up — POST /api/v1/cards/topup/estimate (documented).
  const estRes = await fetch(`${base}/api/v1/cards/topup/estimate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      destination_amount: toBaseUnits(settings.walletAmount, token.decimals ?? 18),
      destination_token_address: token.address ?? token.contract_address,
      payment_method: Platform.OS === 'ios' ? 'apple_pay' : 'google_pay',
    }),
  });
  if (!estRes.ok) throw new Error(`POST /cards/topup/estimate → HTTP ${estRes.status}`);
  const est = (await estRes.json()) as {estimation_id: string};
  return est.estimation_id;
}

interface TokenRow {
  address?: string;
  contract_address?: string;
  symbol?: string;
  decimals?: number;
  equivalent_symbols?: string[];
}

/**
 * Appearance — the token map handed to the Reveal and Collect views, and the mode that map IS.
 *
 * Kept apart from `settings`/`secrets` and broadcast on its OWN channel (`onAppearanceChange`): a
 * restyle must re-render the native views WITHOUT tearing down a live reveal session or clearing a
 * half-typed collect form, so the field screens react to config changes (which rebuild) and to
 * appearance changes (which only re-read the prop) separately.
 *
 * ONE map, not a light/dark pair. The SDK resolves no theme — it draws the one document it is handed,
 * and a host that follows the device supplies a different document when its own screen flips.
 * `themeMode` only tells the SDK which built-in defaults an unset token falls through to.
 */
export type AppearanceTokens = Record<string, string | number>;

let appearanceTokens: AppearanceTokens = {};
let themeMode: WirexThemeMode = 'dark';

const appearanceListeners = new Set<() => void>();
const notifyAppearance = (): void => appearanceListeners.forEach((fn) => fn());

/** Subscribe to an appearance/theme change (the Appearance screen writes, the field screens re-read). */
export const onAppearanceChange = (fn: () => void): (() => void) => {
  appearanceListeners.add(fn);
  return () => appearanceListeners.delete(fn);
};

export const getAppearance = (): Readonly<AppearanceTokens> => appearanceTokens;
export const getThemeMode = (): WirexThemeMode => themeMode;

/** A preset button: replace the whole map outright — a merge would leave the previous preset's tokens on. */
export const setAppearance = (tokens: AppearanceTokens): void => {
  appearanceTokens = {...tokens};
  notifyAppearance();
};

/** A pasted document: merge, so a partial map tweaks the current one rather than replacing it. */
export const mergeAppearance = (tokens: AppearanceTokens): void => {
  appearanceTokens = {...appearanceTokens, ...tokens};
  notifyAppearance();
};

/** Back to an empty map — every token falls through to the mode's own SDK default. */
export const resetAppearance = (): void => {
  appearanceTokens = {};
  notifyAppearance();
};

export const setThemeMode = (mode: WirexThemeMode): void => {
  themeMode = mode;
  notifyAppearance();
};

/**
 * The credential provider the SDK calls. It reads the live config PER CALL, so a bearer or action
 * token pasted on the Config tab takes effect on the next reveal without a remount.
 *
 * A real integration mints these: `getAccessToken` from the partner's auth, `getActionToken` from the
 * user's wallet signature. The example lets you paste them so a device needs no backend or wallet.
 */
export const exampleCredentialProvider: WirexCredentialProvider = {
  async getAccessToken() {
    const token = secrets.bearer;
    if (!token) throw new Error('Set a bearer on the Config tab');
    return token;
  },
  async getActionToken(_scope: WirexActionScope) {
    const token = secrets.actionToken;
    if (!token) throw new Error('Set a step-up action token on the Config tab');
    return token;
  },
  // The backend accepts exactly ONE identity header — sending both X-User-Email and X-User-Wallet is a
  // 400. The SDK forwards whichever this returns, so expose only one: the wallet when set, else email.
  get userEmail() {
    return settings.userWallet ? undefined : settings.userEmail || undefined;
  },
  get userWallet() {
    return settings.userWallet || undefined;
  },
};
