// The binding's createTrade reaches a native module at once, which Jest has not got; the stand-in records the input.
jest.mock('@wirexapp/mobile-sdk', () => ({createTrade: jest.fn(() => ({}))}), {virtual: true});

import {createTrade} from '@wirexapp/mobile-sdk';

import {resetConfig, setSecret, setSetting} from '../exampleConfig';
import {buildExampleTrade, createTestSigner, tradeKey} from '../tradeSdk';

// The contract's synthetic test key 1; it holds nothing.
const KEY_1 = `0x${'01'.repeat(32)}`;
const HASH_SIGNATURE =
  '0x7a74165fa3417ce8bcbf5e37198bc716d10a62bdff3a362e3ee621894cced81319a4190af9718ede6726a4c7e7dc78749c0b014d99e6e0e8042a0748c575c30e1c';
const createTradeMock = createTrade as jest.Mock;

beforeEach(() => {
  resetConfig();
  createTradeMock.mockClear();
});

describe('tradeSdk', () => {
  it('keys a Trade on the environment, the chain and the key address, not the company', () => {
    setSecret('ownerKey', KEY_1);
    setSetting('chainId', '8453');
    const first = tradeKey();
    setSetting('companyId', '00000000-0000-0000-0000-000000000001');
    expect(tradeKey()).toBe(first);
    setSetting('environment', 'production');
    expect(tradeKey()).not.toBe(first);
    const second = tradeKey();
    setSetting('chainId', '5042');
    expect(tradeKey()).not.toBe(second);
    const third = tradeKey();
    setSecret('ownerKey', `0x${'02'.repeat(32)}`);
    expect(tradeKey()).not.toBe(third);
  });

  it('signs a 0x hex hash into 0x hex of 65 bytes', async () => {
    const signer = createTestSigner(KEY_1);
    expect(signer.address).toBe('0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1');
    expect(await signer.signPersonal(`0x${'ab'.repeat(32)}`)).toBe(HASH_SIGNATURE);
    await expect(signer.signPersonal('0xabcd')).rejects.toThrow('32-byte hash');
  });

  it('builds with the config, and reads the bearer per call so a pasted one wins', async () => {
    setSecret('ownerKey', KEY_1);
    setSetting('chainId', '8453');
    setSecret('bearer', 'fake-pasted-bearer');
    const built = buildExampleTrade();
    expect(built.error).toBeNull();
    const input = createTradeMock.mock.calls[0][0];
    expect(input.environment).toBe('test');
    expect(input.chainId).toBe(8453);
    expect(input.signer.address).toBe('0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1');
    expect(await input.tokenProvider.accessToken()).toBe('fake-pasted-bearer');
  });

  it('asks for the chain and the key before it builds', () => {
    expect(buildExampleTrade().error).toBe('Set the chain id on the Config tab');
    setSetting('chainId', '8453');
    expect(buildExampleTrade().error).toBe('Set the owner key on the Config tab');
    expect(createTradeMock).not.toHaveBeenCalled();
  });

  it('shows a refusal from createTrade as an error line', () => {
    setSecret('ownerKey', KEY_1);
    setSetting('chainId', '8453');
    createTradeMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('fake'), {name: 'TradeError', reason: 'invalid_input'});
    });
    expect(buildExampleTrade().error).toBe('invalid_input');
  });
});
