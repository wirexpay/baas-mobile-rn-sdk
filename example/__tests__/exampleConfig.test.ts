// The config is module state, so each test takes a fresh copy of it and of the key-login cache.
const freshConfig = (): typeof import('../exampleConfig') => {
  let config: typeof import('../exampleConfig') | undefined;
  jest.isolateModules(() => {
    config = require('../exampleConfig');
  });
  return config!;
};

// The contract's synthetic test key 1; it holds nothing.
const KEY_1 = `0x${'01'.repeat(32)}`;

const seedLink = (payload: Record<string, unknown>): string =>
  `wirexqa://seed?d=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe('exampleConfig sources', () => {
  it('applies a seed link when no local file is set', () => {
    const config = freshConfig();
    const result = config.applySeedLink(seedLink({chainId: '5042', cardId: 'card-fake-1', bearer: 'fake-bearer'}), 'paste');
    expect(result).toEqual({applied: 3, keys: ['chainId', 'cardId', 'bearer'], kept: []});
    expect(config.getSettings().chainId).toBe('5042');
  });

  it('refuses a whole seed link that carries ownerKey', () => {
    const config = freshConfig();
    const result = config.applySeedLink(seedLink({chainId: '8453', ownerKey: KEY_1}), 'paste');
    expect('rejected' in result && result.rejected).toContain('never carries ownerKey');
    expect(config.getSettings().chainId).toBe('');
    expect(config.getSecret('ownerKey')).toBe('');
  });

  it('gives the local file the last word over the Config tab and a seed link, and keeps it on reset', () => {
    const config = freshConfig();
    config.applyE2eLocalFile({environment: 'production', chainId: '8453', ownerKey: KEY_1});
    expect(config.isFromLocalFile('ownerKey')).toBe(true);

    config.setSetting('chainId', '5042');
    config.setSecret('ownerKey', `0x${'02'.repeat(32)}`);
    expect(config.getSettings().chainId).toBe('8453');
    expect(config.getSecret('ownerKey')).toBe(KEY_1);

    const result = config.applySeedLink(seedLink({chainId: '5042', cardId: 'card-fake-1'}), 'paste');
    expect(result).toEqual({applied: 1, keys: ['cardId'], kept: ['chainId']});

    config.resetConfig();
    expect(config.getSettings().environment).toBe('production');
    expect(config.getSettings().cardId).toBe('');
    expect(config.getSecret('ownerKey')).toBe(KEY_1);
  });

  it('skips an unknown environment name in the local file', () => {
    const config = freshConfig();
    config.applyE2eLocalFile({environment: 'staging'});
    expect(config.isFromLocalFile('environment')).toBe(false);
    expect(config.getSettings().environment).toBe('test');
  });
});

describe('getBearer', () => {
  it('prefers a pasted bearer over the key login', async () => {
    const config = freshConfig();
    config.setSecret('ownerKey', KEY_1);
    config.setSecret('bearer', 'fake-pasted-bearer');
    global.fetch = jest.fn() as unknown as typeof fetch;
    expect(await config.getBearer()).toBe('fake-pasted-bearer');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('logs in with the key when no bearer is pasted', async () => {
    const config = freshConfig();
    config.setSecret('ownerKey', KEY_1);
    config.setSetting('companyId', '00000000-0000-0000-0000-000000000000');
    config.setSetting('chainId', '8453');
    config.setSetting('baasApiUrl', 'https://api.test.invalid');
    const fetchMock = jest.fn(async () => ({ok: true, status: 200, json: async () => ({access_token: 'fake-key-bearer', expires_at: 4102444800})}));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await config.getBearer()).toBe('fake-key-bearer');
    expect(await config.exampleCredentialProvider.getAccessToken()).toBe('fake-key-bearer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks for a bearer or a key when there is neither', async () => {
    const config = freshConfig();
    await expect(config.getBearer()).rejects.toThrow('Set a bearer, or an owner key');
  });
});
