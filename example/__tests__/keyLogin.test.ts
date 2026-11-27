import {bearerFromKey, clearKeyLogin, loginWithOwnerKey} from '../keyLogin';

// The contract's synthetic test key 1; it holds nothing.
const KEY_1 = `0x${'01'.repeat(32)}`;
const PARAMS = {
  baseUrl: 'https://api.test.invalid/',
  companyId: '00000000-0000-0000-0000-000000000000',
  chainId: '8453',
  ownerKey: KEY_1,
};
const NOW_MS = 1700000000_000;

type Call = {url: string; init: {method: string; headers: Record<string, string>; body: string}};

const fakeFetch = (status: number, body: unknown) => {
  const calls: Call[] = [];
  const fn = async (url: string, init: Call['init']) => {
    calls.push({url, init});
    return {ok: status >= 200 && status < 300, status, json: async () => body};
  };
  return {calls, fn};
};

beforeEach(() => clearKeyLogin());

describe('loginWithOwnerKey', () => {
  it('posts the signed message with the company and chain headers and no bearer', async () => {
    const {calls, fn} = fakeFetch(200, {access_token: 'fake-token', expires_at: 1700003600});
    const token = await loginWithOwnerKey(PARAMS, () => NOW_MS, fn);

    expect(token).toEqual({accessToken: 'fake-token', expiresAt: 1700003600});
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test.invalid/api/v1/user/authorize');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Company-Id': PARAMS.companyId,
      'X-Chain-Id': '8453',
    });
    expect(JSON.parse(calls[0].init.body)).toEqual({
      owner_address: '0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1',
      message_signature:
        '0xa829678f074b9ce8bd93e008dd8a0473a042627005b0d16fd94faf9e1a302cee314e84bec621b51a61e627276faf4a91d25c9a0a779aca8de02db66bdd67b1ec1c',
      nonce: 1700000000,
    });
  });

  it('reports the HTTP status and the route reason of a refusal', async () => {
    const {fn} = fakeFetch(401, {error_reason: 'ErrorExpired'});
    await expect(loginWithOwnerKey(PARAMS, () => NOW_MS, fn)).rejects.toThrow('HTTP 401 (ErrorExpired)');
  });

  it('refuses a base that is not https before signing anything', async () => {
    const {calls, fn} = fakeFetch(200, {});
    await expect(loginWithOwnerKey({...PARAMS, baseUrl: 'http://api.test.invalid'}, () => NOW_MS, fn)).rejects.toThrow('https');
    expect(calls).toHaveLength(0);
  });

  it('refuses an answer without a token', async () => {
    const {fn} = fakeFetch(200, {});
    await expect(loginWithOwnerKey(PARAMS, () => NOW_MS, fn)).rejects.toThrow('no access_token');
  });
});

describe('bearerFromKey', () => {
  it('keeps the bearer while it has over a minute left, then logs in again', async () => {
    const {calls, fn} = fakeFetch(200, {access_token: 'fake-token', expires_at: 1700000120});
    let now = NOW_MS;
    expect(await bearerFromKey(PARAMS, () => now, fn)).toBe('fake-token');
    now = NOW_MS + 59_000;
    await bearerFromKey(PARAMS, () => now, fn);
    expect(calls).toHaveLength(1);
    now = NOW_MS + 61_000;
    await bearerFromKey(PARAMS, () => now, fn);
    expect(calls).toHaveLength(2);
  });

  it('sends one login for calls made while one is in flight', async () => {
    const {calls, fn} = fakeFetch(200, {access_token: 'fake-token', expires_at: 1700003600});
    const tokens = await Promise.all([bearerFromKey(PARAMS, () => NOW_MS, fn), bearerFromKey(PARAMS, () => NOW_MS, fn)]);
    expect(tokens).toEqual(['fake-token', 'fake-token']);
    expect(calls).toHaveLength(1);
  });

  it('logs in again for another company', async () => {
    const {calls, fn} = fakeFetch(200, {access_token: 'fake-token', expires_at: 1700003600});
    await bearerFromKey(PARAMS, () => NOW_MS, fn);
    await bearerFromKey({...PARAMS, companyId: '00000000-0000-0000-0000-000000000001'}, () => NOW_MS, fn);
    expect(calls).toHaveLength(2);
  });
});
