import {checkBuyAmount, checkTerms, usdTextToUnits, worthCents} from '../tradeGuards';

const buy = (amountIn: string, transferFee: string | null = null, tokenInDecimals = 6) => ({
  side: 'buy' as const,
  amountIn,
  tokenInDecimals,
  estimatedAmountOut: '1',
  tokenOutDecimals: 18,
  transferFee,
});

const sell = (estimatedAmountOut: string, tokenOutDecimals = 6) => ({
  side: 'sell' as const,
  amountIn: '5000000000000000000',
  tokenInDecimals: 18,
  estimatedAmountOut,
  tokenOutDecimals,
});

describe('tradeGuards', () => {
  it('reads USD text at 6 decimals', () => {
    expect(usdTextToUnits('10')).toBe(10_000_000n);
    expect(usdTextToUnits('9.99')).toBe(9_990_000n);
    expect(usdTextToUnits('1.2345678')).toBeNull();
    expect(usdTextToUnits('abc')).toBeNull();
  });

  it('refuses a typed production buy over 10 USD, and one it cannot read', () => {
    expect(checkBuyAmount('production', 'buy', '10')).toBeNull();
    expect(checkBuyAmount('production', 'buy', '10.000001')).toContain('worth 10.01 USD');
    expect(checkBuyAmount('production', 'buy', '1,5')).toContain('cannot be read');
    expect(checkBuyAmount('production', 'buy', '')).toBeNull();
    expect(checkBuyAmount('test', 'buy', '500')).toBeNull();
    expect(checkBuyAmount('production', 'sell', '500')).toBeNull();
  });

  it('rounds a worth up to the cent', () => {
    expect(worthCents(buy('10000001'))).toBe(1001n);
    expect(worthCents(buy('10000000'))).toBe(1000n);
    expect(worthCents(sell('9999999999999999999', 18))).toBe(1000n);
  });

  it('counts the transfer fee into a buy, and reads an order with no fee', () => {
    expect(checkTerms('production', buy('9990000'))).toBeNull();
    expect(checkTerms('production', buy('9990000', '20000'))).toContain('worth 10.01 USD');
    const order = {side: 'buy' as const, amountIn: '10000000', tokenInDecimals: 6, estimatedAmountOut: '1', tokenOutDecimals: 18};
    expect(checkTerms('production', order)).toBeNull();
  });

  it('values a sale by the USDC it pays', () => {
    expect(checkTerms('production', sell('10000000'))).toBeNull();
    expect(checkTerms('production', sell('10000001'))).toContain('at most 10.00 USD');
  });

  it('refuses an unreadable worth on production only', () => {
    expect(checkTerms('production', buy('12.5'))).toContain('cannot be read');
    expect(checkTerms('production', {...sell('1'), tokenOutDecimals: -1})).toContain('cannot be read');
    expect(checkTerms('test', buy('12.5'))).toBeNull();
    expect(checkTerms('test', sell('999000000'))).toBeNull();
  });
});
