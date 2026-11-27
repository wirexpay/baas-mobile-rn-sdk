import {errorLine, quoteForResume, showTime, showUnits, stepLogLine} from '../tradeView';

import type {TradeQuote} from '@wirexapp/mobile-sdk';

const tradeError = (fields: Record<string, unknown>) => Object.assign(new Error('fake'), {name: 'TradeError', ...fields});

describe('errorLine', () => {
  it('writes every part in order', () => {
    const e = tradeError({
      reason: 'quote_expired',
      step: 'submit',
      routeReason: 'ErrorExpired',
      detailKey: 'valid_until',
      httpStatus: 400,
      entryPointCode: 'AA22',
    });
    expect(errorLine(e)).toBe('quote_expired · (get a new quote) · step submit · route ErrorExpired / valid_until · HTTP 400 · AA22');
  });

  it('leaves out each part that is absent', () => {
    expect(errorLine(tradeError({reason: 'call_refused', step: 'check', routeReason: null, httpStatus: null}))).toBe('call_refused · step check');
    expect(errorLine(tradeError({reason: 'api_error', routeReason: 'ErrorGeneral'}))).toBe('api_error · route ErrorGeneral');
    expect(errorLine(tradeError({reason: 'quote_required'}))).toBe('quote_required');
  });

  it('gives the five hints', () => {
    expect(errorLine(tradeError({reason: 'signer_mismatch'}))).toBe('signer_mismatch · (the key does not own this account)');
    expect(errorLine(tradeError({reason: 'investment_wallet_required'}))).toContain('(set up the account first)');
    expect(errorLine(tradeError({reason: 'insufficient_funds'}))).toContain('(the main account cannot cover the buy)');
    expect(errorLine(tradeError({reason: 'order_not_ended'}))).toContain('(the order is still open: resume it from Open orders)');
  });

  it('shows another error by its message', () => {
    expect(errorLine(new Error('Set the chain id on the Config tab'))).toBe('Set the chain id on the Config tab');
    expect(errorLine(new TypeError('boom'))).toBe('TypeError: boom');
  });
});

describe('the rest of the view', () => {
  it('logs a step without its hashes', () => {
    const line = stepLogLine({step: 'store', state: 'done', orderId: 'order-1', userOpHash: `0x${'ab'.repeat(32)}`, transactionHash: `0x${'cd'.repeat(32)}`});
    expect(line).toBe('trade: step store done');
    expect(stepLogLine({step: 'awaitOrder', state: 'failed', status: 'Processing', reason: 'order_not_ended'})).toBe(
      'trade: step awaitOrder failed status=Processing reason=order_not_ended',
    );
  });

  it('passes the last quote to resume only for its own order', () => {
    const quote = {orderId: 'order-1'} as TradeQuote;
    expect(quoteForResume({orderId: 'order-1'}, quote)).toBe(quote);
    expect(quoteForResume({orderId: 'order-2'}, quote)).toBeNull();
    expect(quoteForResume({orderId: 'order-1'}, null)).toBeNull();
  });

  it('shows units and times, with a dash for what is absent', () => {
    expect(showUnits('10500000', 6)).toBe('10.5');
    expect(showUnits('5', 6)).toBe('0.000005');
    expect(showUnits('7', 0)).toBe('7');
    expect(showUnits(null, 6)).toBe('—');
    expect(showTime(null)).toBe('—');
    expect(showTime('2026-11-27T10:00:00Z')).toBe('2026-11-27T10:00:00Z');
  });
});
