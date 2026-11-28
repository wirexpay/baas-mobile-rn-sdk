import {capForQuote, checkSendAmount, leaves, refuseSend} from '../cryptoGuards';

import type {CryptoBalance, Hex, SendQuote} from '@wirexapp/mobile-sdk';

const USDC = `0x${'0a'.repeat(20)}` as Hex;
const WUSD = `0x${'0b'.repeat(20)}` as Hex;
const DOGE = `0x${'0c'.repeat(20)}` as Hex;

const balances: CryptoBalance[] = [
  {token: USDC, symbol: 'USDC', units: '0', decimals: 6},
  {token: WUSD, symbol: 'WUSD', units: '50000000', decimals: 6},
  {token: DOGE, symbol: 'DOGE', units: '1', decimals: 8},
];

const quote = (payToken: Hex, payUnits: string, unwrap: SendQuote['unwrap'] = null) => ({payToken, payUnits, unwrap});

describe('cryptoGuards', () => {
  it('counts USD stablecoins at face value and EUR at x1.25, rounded up', () => {
    expect(refuseSend('production', 'USDC', 1000n)).toBeNull();
    expect(refuseSend('production', 'usdt', 1001n)).toContain('worth 10.01 USD');
    expect(refuseSend('production', 'EURC', 800n)).toBeNull();
    expect(refuseSend('production', 'WEUR', 801n)).toContain('worth 10.02 USD');
  });

  it('refuses any other symbol and an unreadable worth on production only', () => {
    expect(refuseSend('production', 'DOGE', 1n)).toContain('only USDC, USDT, WUSD, EURC and WEUR');
    expect(refuseSend('production', 'USDC', null)).toContain('cannot be read');
    expect(refuseSend('test', 'DOGE', 999999n)).toBeNull();
  });

  it('checks the typed amount as what arrives', () => {
    expect(checkSendAmount('production', 'USDC', '10')).toBeNull();
    expect(checkSendAmount('production', 'USDC', '10.001')).toContain('worth 10.01 USD');
    expect(checkSendAmount('production', 'USDC', '1,5')).toContain('cannot be read');
    expect(checkSendAmount('production', 'BTC', '1')).toContain('only USDC');
    expect(checkSendAmount('production', 'USDC', '')).toBeNull();
    expect(checkSendAmount('test', 'BTC', '500')).toBeNull();
  });

  it('takes what leaves from the unwrap when the quote unwraps, otherwise the pay token', () => {
    expect(leaves(quote(USDC, '9000000', {token: WUSD, units: '9100000'}))).toEqual({token: WUSD, units: '9100000'});
    expect(leaves(quote(USDC, '9000000'))).toEqual({token: USDC, units: '9000000'});
  });

  it('values what leaves by its fresh balance row', () => {
    expect(capForQuote('production', quote(USDC, '10500000', {token: WUSD, units: '9990000'}), balances)).toBeNull();
    expect(capForQuote('production', quote(USDC, '9000000', {token: WUSD, units: '10000001'}), balances)).toContain('worth 10.01 USD');
    expect(capForQuote('production', quote(USDC, '10000000'), balances)).toBeNull();
    expect(capForQuote('production', quote(DOGE, '1'), balances)).toContain('only USDC');
  });

  it('refuses a token missing from the balances on production only', () => {
    const missing = `0x${'0d'.repeat(20)}` as Hex;
    expect(capForQuote('production', quote(missing, '1'), balances)).toContain('not among the balances');
    expect(capForQuote('production', quote(USDC, '1', {token: missing, units: '1'}), balances)).toContain('not among the balances');
    expect(capForQuote('test', quote(missing, '1'), balances)).toBeNull();
  });

  it('matches the token whatever its case', () => {
    expect(capForQuote('production', quote(USDC.toUpperCase().replace('0X', '0x') as Hex, '1000000'), balances)).toBeNull();
  });
});
