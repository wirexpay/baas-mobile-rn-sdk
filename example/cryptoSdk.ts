import {createCrypto, type Crypto} from '@wirexapp/mobile-sdk';

import {getBearer, getSecret, getSettings, type ExampleEnvironment} from './exampleConfig';
import {CRYPTO_HINTS} from './cryptoView';
import {createTestSigner, tradeKey} from './tradeSdk';
import {errorLine} from './tradeView';

export type BuiltCrypto =
  | {key: string; environment: ExampleEnvironment; crypto: Crypto; error: null}
  | {key: string; environment: ExampleEnvironment; crypto: null; error: string};

/** One `Crypto` from the Config tab, keyed like `Trade`. The bearer is read per call, so a pasted one still wins. */
export const buildExampleCrypto = (): BuiltCrypto => {
  const key = tradeKey();
  const {environment, chainId} = getSettings();
  const fail = (error: string): BuiltCrypto => ({key, environment, crypto: null, error});
  if (!/^\d+$/.test(chainId.trim())) return fail('Set the chain id on the Config tab');
  const keyText = getSecret('ownerKey');
  if (!keyText) return fail('Set the owner key on the Config tab');
  try {
    const crypto = createCrypto({
      environment,
      chainId: Number(chainId.trim()),
      tokenProvider: {accessToken: getBearer},
      signer: createTestSigner(keyText),
    });
    return {key, environment, crypto, error: null};
  } catch (e) {
    return fail(errorLine(e, CRYPTO_HINTS));
  }
};
