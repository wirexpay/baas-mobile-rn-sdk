// FOR TESTING ONLY. Signs with a test user's exported key held in memory, so testers can run a trade.
// A real app signs in the user's own wallet and never holds the key.
import {hmac} from '@noble/hashes/hmac';
import {sha256} from '@noble/hashes/sha2';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex, hexToBytes, utf8ToBytes} from '@noble/hashes/utils';
import * as secp from '@noble/secp256k1';

secp.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => hmac(sha256, key, secp.etc.concatBytes(...messages));

const KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

/** True when the text is a 32-byte hex key, with or without 0x. Says nothing about the value. */
export const isOwnerKeyShaped = (text: string): boolean => KEY_PATTERN.test(text.trim());

/** The 32 key bytes; throws a message that never quotes the input. */
export const parseOwnerKey = (text: string): Uint8Array => {
  const trimmed = text.trim();
  if (!KEY_PATTERN.test(trimmed)) throw new Error('The owner key must be 32 bytes of hex');
  const key = hexToBytes(trimmed.replace(/^0x/, ''));
  if (!secp.utils.isValidPrivateKey(key)) throw new Error('The owner key is not a valid secp256k1 key');
  return key;
};

/** EIP-55 form of a 20-byte hex address. */
export const toChecksumAddress = (address: string): string => {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
};

/** The key's address, EIP-55. */
export const ownerAddress = (key: Uint8Array): string => {
  const publicKey = secp.getPublicKey(key, false);
  return toChecksumAddress(bytesToHex(keccak_256(publicKey.slice(1)).slice(12)));
};

const signDigest = (key: Uint8Array, digest: Uint8Array): Uint8Array => {
  const signature = secp.sign(digest, key);
  const out = new Uint8Array(65);
  out.set(signature.toCompactRawBytes(), 0);
  out[64] = 27 + signature.recovery;
  return out;
};

const personalDigest = (message: Uint8Array): Uint8Array =>
  keccak_256(secp.etc.concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${message.length}`), message));

/** EIP-191 personal_sign over UTF-8 text: 65 bytes r ‖ s ‖ v as 0x hex, v 27 or 28. */
export const signPersonalMessage = (key: Uint8Array, text: string): string =>
  `0x${bytesToHex(signDigest(key, personalDigest(utf8ToBytes(text))))}`;

/** EIP-191 over the raw 32 bytes of a hash, as the SDK's signer asks: 65 bytes r ‖ s ‖ v, v 27 or 28. */
export const signPersonalHash = (key: Uint8Array, hash: Uint8Array): Uint8Array => {
  if (hash.length !== 32) throw new Error('signPersonalHash takes a 32-byte hash');
  return signDigest(key, personalDigest(hash));
};
