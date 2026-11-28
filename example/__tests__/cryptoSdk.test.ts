// The binding's createCrypto reaches a native module at once, which Jest has not got; the stand-in records the input.
jest.mock('@wirexapp/mobile-sdk', () => ({createCrypto: jest.fn(() => ({})), createTrade: jest.fn(() => ({}))}), {virtual: true});

import {createCrypto} from '@wirexapp/mobile-sdk';

import {buildExampleCrypto} from '../cryptoSdk';
import {resetConfig, setSecret, setSetting} from '../exampleConfig';

// The contract's synthetic test key 1; it holds nothing.
const KEY_1 = `0x${'01'.repeat(32)}`;
const createCryptoMock = createCrypto as jest.Mock;

beforeEach(() => {
  resetConfig();
  createCryptoMock.mockClear();
});

describe('cryptoSdk', () => {
  it('builds with the config, and reads the bearer per call so a pasted one wins', async () => {
    setSecret('ownerKey', KEY_1);
    setSetting('chainId', '5042');
    setSetting('environment', 'production');
    setSecret('bearer', 'fake-pasted-bearer');
    expect(buildExampleCrypto().error).toBeNull();
    const input = createCryptoMock.mock.calls[0][0];
    expect(input.environment).toBe('production');
    expect(input.chainId).toBe(5042);
    expect(input.signer.address).toBe('0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1');
    expect(await input.tokenProvider.accessToken()).toBe('fake-pasted-bearer');
  });

  it('asks for the chain and the key before it builds', () => {
    expect(buildExampleCrypto().error).toBe('Set the chain id on the Config tab');
    setSetting('chainId', '8453');
    expect(buildExampleCrypto().error).toBe('Set the owner key on the Config tab');
    expect(createCryptoMock).not.toHaveBeenCalled();
  });

  it('shows a refusal from createCrypto as an error line', () => {
    setSecret('ownerKey', KEY_1);
    setSetting('chainId', '8453');
    createCryptoMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('fake'), {name: 'CryptoError', reason: 'invalid_address'});
    });
    expect(buildExampleCrypto().error).toBe('invalid_address · (the recipient is not an address of that network)');
  });
});
