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
import type {WirexActionScope, WirexCredentialProvider} from '@wirexapp/mobile-sdk';

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
