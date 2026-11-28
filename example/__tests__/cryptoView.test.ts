import {CRYPTO_HINTS, cryptoStepLogLine, heldFor, holdQuote, isDeliveryCheckable, showUnixTime} from '../cryptoView';
import {errorLine} from '../tradeView';

import type {SendQuote} from '@wirexapp/mobile-sdk';

const quote = (sendId: string, requestHash: string) => ({sendId, requestHash}) as SendQuote;
const cryptoError = (fields: Record<string, unknown>) => Object.assign(new Error('fake'), {name: 'CryptoError', ...fields});

describe('cryptoView', () => {
  it('holds one quote per send, the newest', () => {
    const first = quote('send-1', '0xaa');
    const again = quote('send-1', '0xbb');
    const other = quote('send-2', '0xcc');
    expect(holdQuote(holdQuote(holdQuote([], first), other), again)).toEqual([other, again]);
  });

  it('finds the held quote of a pending row by requestHash, whatever the case', () => {
    const held = [quote('send-1', `0x${'AB'.repeat(32)}`)];
    expect(heldFor({hash: `0x${'ab'.repeat(32)}`}, held)).toBe(held[0]);
    expect(heldFor({hash: `0x${'cd'.repeat(32)}`}, held)).toBeNull();
  });

  it('offers a delivery check off the transfer rail only', () => {
    expect(isDeliveryCheckable(null)).toBe(false);
    expect(isDeliveryCheckable({rail: 'transfer'})).toBe(false);
    expect(isDeliveryCheckable({rail: 'cctp'})).toBe(true);
    expect(isDeliveryCheckable({rail: 'across'})).toBe(true);
  });

  it('writes the error line with the crypto hints', () => {
    expect(errorLine(cryptoError({reason: 'recipient_is_account'}), CRYPTO_HINTS)).toBe('recipient_is_account · (the recipient is the main account itself)');
    expect(
      errorLine(cryptoError({reason: 'bridge_refused', step: 'execute', routeReason: null, httpStatus: 422, entryPointCode: null}), CRYPTO_HINTS),
    ).toBe('bridge_refused · step execute · HTTP 422');
    expect(errorLine(cryptoError({reason: 'insufficient_funds'}), CRYPTO_HINTS)).toBe('insufficient_funds · (the main account cannot cover the send)');
    expect(Object.keys(CRYPTO_HINTS)).toHaveLength(12);
  });

  it('logs a step without its hashes', () => {
    expect(cryptoStepLogLine({step: 'execute', state: 'done', sendId: 'send-1', transactionHash: `0x${'ab'.repeat(32)}`})).toBe('crypto: step execute done');
    expect(cryptoStepLogLine({step: 'request', state: 'failed', reason: 'quote_expired'})).toBe('crypto: step request failed reason=quote_expired');
  });

  it('shows a Unix time, or a dash', () => {
    expect(showUnixTime(null)).toBe('—');
    expect(showUnixTime('2026-11-27T10:00:00Z')).toBe('2026-11-27T10:00:00Z');
    expect(showUnixTime('1700000000')).not.toBe('1700000000');
  });
});
