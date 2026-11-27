import {hexToBytes} from '@noble/hashes/utils';

import {buildLoginMessage} from '../keyLogin';
import {isOwnerKeyShaped, ownerAddress, parseOwnerKey, signPersonalHash, signPersonalMessage, toChecksumAddress} from '../testSigner';

// The synthetic test keys of the SDK's contract vectors (0x01 and 0x02 repeated); they hold nothing.
const KEY_1 = `0x${'01'.repeat(32)}`;
const KEY_2 = `0x${'02'.repeat(32)}`;
// Signatures pinned from an independent implementation (ethers 6.13.4 `signMessage`).
const LOGIN_SIGNATURE =
  '0xa829678f074b9ce8bd93e008dd8a0473a042627005b0d16fd94faf9e1a302cee314e84bec621b51a61e627276faf4a91d25c9a0a779aca8de02db66bdd67b1ec1c';
const HASH_SIGNATURE =
  '0x7a74165fa3417ce8bcbf5e37198bc716d10a62bdff3a362e3ee621894cced81319a4190af9718ede6726a4c7e7dc78749c0b014d99e6e0e8042a0748c575c30e1c';

const toHex = (bytes: Uint8Array): string => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;

describe('testSigner', () => {
  it('derives the EIP-55 address of each contract test key', () => {
    expect(ownerAddress(parseOwnerKey(KEY_1))).toBe('0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1');
    expect(ownerAddress(parseOwnerKey(KEY_2.slice(2)))).toBe('0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c');
  });

  it('signs the login message as personal_sign does', () => {
    const key = parseOwnerKey(KEY_1);
    const message = buildLoginMessage(ownerAddress(key), '00000000-0000-0000-0000-000000000000', '8453', 1700000000);
    expect(signPersonalMessage(key, message)).toBe(LOGIN_SIGNATURE);
  });

  it('signs EIP-191 over the raw 32 bytes of a hash, 65 bytes with v 27 or 28', () => {
    const signature = signPersonalHash(parseOwnerKey(KEY_1), hexToBytes('ab'.repeat(32)));
    expect(signature).toHaveLength(65);
    expect([27, 28]).toContain(signature[64]);
    expect(toHex(signature)).toBe(HASH_SIGNATURE);
  });

  it('refuses a hash that is not 32 bytes', () => {
    expect(() => signPersonalHash(parseOwnerKey(KEY_1), new Uint8Array(31))).toThrow('32-byte hash');
  });

  it('refuses a malformed or zero key without quoting it', () => {
    expect(isOwnerKeyShaped('0x1234')).toBe(false);
    expect(() => parseOwnerKey('0xnot-a-key')).toThrow('The owner key must be 32 bytes of hex');
    expect(() => parseOwnerKey(`0x${'00'.repeat(32)}`)).toThrow('not a valid secp256k1 key');
  });

  it('checksums an address in any case', () => {
    expect(toChecksumAddress('0x1A642F0E3C3AF545E7ACBD38B07251B3990914F1')).toBe('0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1');
  });
});
