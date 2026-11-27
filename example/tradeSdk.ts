import {createTrade, type Hex, type Trade, type TradeSigner} from '@wirexapp/mobile-sdk';
import {bytesToHex, hexToBytes} from '@noble/hashes/utils';

import {getBearer, getSecret, getSettings, type ExampleEnvironment} from './exampleConfig';
import {isOwnerKeyShaped, ownerAddress, parseOwnerKey, signPersonalHash} from './testSigner';
import {errorLine} from './tradeView';

/** The key's address, or '' when there is no valid key. */
export const ownerKeyAddress = (keyText: string): string => {
  if (!isOwnerKeyShaped(keyText)) return '';
  try {
    return ownerAddress(parseOwnerKey(keyText));
  } catch {
    return '';
  }
};

/** What a `Trade` is built from: a new one is made when this changes. */
export const tradeKey = (): string => {
  const {environment, chainId} = getSettings();
  return `${environment}|${chainId.trim()}|${ownerKeyAddress(getSecret('ownerKey'))}`;
};

/** FOR TESTING ONLY: signs each 32-byte hash the SDK hands over with the test user's key. */
export const createTestSigner = (keyText: string): TradeSigner => {
  const key = parseOwnerKey(keyText);
  return {
    address: ownerAddress(key),
    async signPersonal(hash: Hex): Promise<Hex> {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('signPersonal takes a 0x hex 32-byte hash');
      return `0x${bytesToHex(signPersonalHash(key, hexToBytes(hash.slice(2))))}`;
    },
  };
};

export type BuiltTrade =
  | {key: string; environment: ExampleEnvironment; trade: Trade; error: null}
  | {key: string; environment: ExampleEnvironment; trade: null; error: string};

/** One `Trade` from the Config tab. The bearer is read per call, so a pasted one still wins. */
export const buildExampleTrade = (): BuiltTrade => {
  const key = tradeKey();
  const {environment, chainId} = getSettings();
  const fail = (error: string): BuiltTrade => ({key, environment, trade: null, error});
  if (!/^\d+$/.test(chainId.trim())) return fail('Set the chain id on the Config tab');
  const keyText = getSecret('ownerKey');
  if (!keyText) return fail('Set the owner key on the Config tab');
  try {
    const trade = createTrade({
      environment,
      chainId: Number(chainId.trim()),
      tokenProvider: {accessToken: getBearer},
      signer: createTestSigner(keyText),
    });
    return {key, environment, trade, error: null};
  } catch (e) {
    return fail(errorLine(e));
  }
};
