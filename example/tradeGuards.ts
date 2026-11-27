import type {ExampleEnvironment} from './exampleConfig';

/** The most a trade on `production` may be worth in the example, in cents. */
export const PRODUCTION_CAP_CENTS = 1000n;
const USD_DECIMALS = 6;

/** The fields a trade's worth is read from: a quote's, or an open order's, which has no transfer fee. */
export interface TradeTerms {
  side: 'buy' | 'sell';
  amountIn: string;
  tokenInDecimals: number;
  estimatedAmountOut: string;
  tokenOutDecimals: number;
  transferFee?: string | null;
}

const UNITS = /^\d+$/;
const isDecimals = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 36;

// Base units at `decimals` to cents, rounded up, so a fraction of a cent over the cap still counts.
const ceilCents = (units: bigint, decimals: number): bigint => {
  const scale = 10n ** BigInt(decimals);
  return (units * 100n + scale - 1n) / scale;
};

const showCents = (cents: bigint): string => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const CAP = `Refused: on production the example trades at most ${showCents(PRODUCTION_CAP_CENTS)} USD`;
const overCap = (cents: bigint): string | null => (cents > PRODUCTION_CAP_CENTS ? `${CAP}, and this trade is worth ${showCents(cents)} USD.` : null);
const UNREADABLE = `${CAP}, and this trade's worth cannot be read.`;

/** A buy's USD text at 6 decimals, or null when it is not a plain decimal of at most 6 places. */
export const usdTextToUnits = (text: string): bigint | null => {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/.exec(text.trim());
  if (!match) return null;
  const [, whole, frac = ''] = match;
  return BigInt(whole) * 10n ** BigInt(USD_DECIMALS) + BigInt(frac.padEnd(USD_DECIMALS, '0'));
};

/** A trade's worth in cents, rounded up: a buy spends `amountIn` plus the transfer fee, a sale pays `estimatedAmountOut`. */
export const worthCents = (terms: TradeTerms): bigint | null => {
  if (terms.side === 'buy') {
    const fee = terms.transferFee ?? '0';
    if (!UNITS.test(terms.amountIn) || !UNITS.test(fee) || !isDecimals(terms.tokenInDecimals)) return null;
    return ceilCents(BigInt(terms.amountIn) + BigInt(fee), terms.tokenInDecimals);
  }
  if (terms.side === 'sell') {
    if (!UNITS.test(terms.estimatedAmountOut) || !isDecimals(terms.tokenOutDecimals)) return null;
    return ceilCents(BigInt(terms.estimatedAmountOut), terms.tokenOutDecimals);
  }
  return null;
};

// SECURITY: the cap keeps a production run to a small real amount. It is checked on the typed buy
// amount, on the quote, again at Execute, and on an open order's terms before Resume.

/** Before the quote: a production buy's typed amount. A sale's amount is in tokens, so its check waits for the quote. */
export const checkBuyAmount = (environment: ExampleEnvironment, side: 'buy' | 'sell', amountText: string): string | null => {
  if (environment !== 'production' || side !== 'buy' || !amountText.trim()) return null;
  const units = usdTextToUnits(amountText);
  return units === null ? UNREADABLE : overCap(ceilCents(units, USD_DECIMALS));
};

/** On a quote, and on an open order's terms: refused over the cap, or when the worth cannot be read. */
export const checkTerms = (environment: ExampleEnvironment, terms: TradeTerms): string | null => {
  if (environment !== 'production') return null;
  const cents = worthCents(terms);
  return cents === null ? UNREADABLE : overCap(cents);
};
