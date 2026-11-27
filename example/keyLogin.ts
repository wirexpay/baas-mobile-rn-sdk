// FOR TESTING ONLY. Gets a bearer from the test user's key through the wallet-signature login.
// A real app gets its bearer from its own auth; the key never leaves the user's wallet.
import {diag} from './diagLog';
import {ownerAddress, parseOwnerKey, signPersonalMessage} from './testSigner';

export interface KeyLoginParams {
  /** The api-business base, https. */
  baseUrl: string;
  /** Sent as X-Company-Id and signed into the message exactly as sent. */
  companyId: string;
  /** Sent as X-Chain-Id and signed into the message exactly as sent. */
  chainId: string;
  ownerKey: string;
}

export interface KeyLoginToken {
  accessToken: string;
  /** Unix seconds, as `POST /api/v1/user/authorize` answers it. */
  expiresAt: number;
}

type FetchLike = (url: string, init: {method: string; headers: Record<string, string>; body: string}) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** The message api-business verifies; owner, company and chain go in exactly as the request sends them. */
export const buildLoginMessage = (owner: string, companyId: string, chainId: string, nonce: number): string =>
  `I, owner of account ${owner} confirm that I request access token for company ${companyId} on chain ${chainId} at ${nonce}`;

const errorReason = (body: unknown): string | undefined => {
  const reason = (body as {error_reason?: unknown} | null)?.error_reason;
  return typeof reason === 'string' ? reason : undefined;
};

/** One login: signs the message with the key and posts it. The nonce is the Unix time in seconds. */
export async function loginWithOwnerKey(
  params: KeyLoginParams,
  now: () => number = Date.now,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<KeyLoginToken> {
  const base = params.baseUrl.trim().replace(/\/+$/, '');
  // SECURITY: https only, because the signed login goes to whatever host is typed here.
  if (!/^https:\/\//.test(base)) throw new Error('Set an https BaaS API URL on the Config tab');
  if (!params.companyId.trim()) throw new Error('Set the company id on the Config tab');
  if (!params.chainId.trim()) throw new Error('Set the chain id on the Config tab');
  const key = parseOwnerKey(params.ownerKey);
  const owner = ownerAddress(key);
  const nonce = Math.floor(now() / 1000);
  const message = buildLoginMessage(owner, params.companyId, params.chainId, nonce);

  diag('sdk', 'login: wallet-signature login sent');
  const res = await fetchImpl(`${base}/api/v1/user/authorize`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Company-Id': params.companyId, 'X-Chain-Id': params.chainId},
    body: JSON.stringify({owner_address: owner, message_signature: signPersonalMessage(key, message), nonce}),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = errorReason(body);
    diag('err', `login: HTTP ${res.status}${reason ? ` ${reason}` : ''}`);
    throw new Error(`POST /api/v1/user/authorize → HTTP ${res.status}${reason ? ` (${reason})` : ''}`);
  }
  const token = (body as {access_token?: unknown} | null)?.access_token;
  const expiresAt = (body as {expires_at?: unknown} | null)?.expires_at;
  if (typeof token !== 'string' || !token) throw new Error('POST /api/v1/user/authorize answered no access_token');
  diag('sdk', `login: bearer received (${token.length} chars)`);
  return {accessToken: token, expiresAt: typeof expiresAt === 'number' ? expiresAt : 0};
}

// The login is rate-limited per IP and each nonce is single-use, so the bearer is kept in memory.
let cached: {cacheKey: string; token: KeyLoginToken} | null = null;
let inFlight: {cacheKey: string; promise: Promise<string>} | null = null;
const EXPIRY_MARGIN_SECONDS = 60;

/** A bearer for the key, from memory while it has over a minute left, else from one login. */
export async function bearerFromKey(
  params: KeyLoginParams,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<string> {
  const cacheKey = [params.baseUrl.trim(), params.companyId, params.chainId, ownerAddress(parseOwnerKey(params.ownerKey))].join('|');
  if (cached?.cacheKey === cacheKey && cached.token.expiresAt - EXPIRY_MARGIN_SECONDS > now() / 1000) {
    return cached.token.accessToken;
  }
  if (inFlight?.cacheKey === cacheKey) return inFlight.promise;
  const promise = loginWithOwnerKey(params, now, fetchImpl)
    .then((token) => {
      cached = {cacheKey, token};
      return token.accessToken;
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = {cacheKey, promise};
  return promise;
}

/** Drops the bearer the key login minted. */
export const clearKeyLogin = (): void => {
  cached = null;
  inFlight = null;
};
