import type {CryptoBalance, SendQuote} from '@wirexapp/mobile-sdk';

import type {ExampleEnvironment} from './exampleConfig';
import {ceilCents, PRODUCTION_CAP_CENTS, showCents, usdTextToUnits} from './tradeGuards';

const USD_DECIMALS = 6;

/** USD per unit of each token a production send may move; EUR is overstated, so the cap stops near 8 EUR. */
const CAP_RATES: Readonly<Record<string, {num: bigint; den: bigint}>> = {
  USDC: {num: 1n, den: 1n},
  USDT: {num: 1n, den: 1n},
  WUSD: {num: 1n, den: 1n},
  EURC: {num: 5n, den: 4n},
  WEUR: {num: 5n, den: 4n},
};

const CAP = `Refused: on production the example sends at most ${showCents(PRODUCTION_CAP_CENTS)} USD`;
const ONLY_LISTED = 'Refused: on production the example sends only USDC, USDT, WUSD, EURC and WEUR.';
const UNREADABLE = `${CAP}, and this send's worth cannot be read.`;
const NOT_HELD = `${CAP}, and the token that leaves is not among the balances.`;

// SECURITY: the cap keeps a production run to a small real amount. It is checked on the typed amount,
// and again at Send and at Resume on what the quote makes leave.

/** Why a send of `cents` of `symbol` is refused, or null when it may run. */
export const refuseSend = (environment: ExampleEnvironment, symbol: string, cents: bigint | null): string | null => {
  if (environment !== 'production') return null;
  const rate = CAP_RATES[symbol.trim().toUpperCase()];
  if (!rate) return ONLY_LISTED;
  if (cents === null) return UNREADABLE;
  const usdCents = (cents * rate.num + rate.den - 1n) / rate.den;
  return usdCents > PRODUCTION_CAP_CENTS ? `${CAP}, and this send is worth ${showCents(usdCents)} USD.` : null;
};

/** Before the quote: the typed amount of the typed token, as what arrives. */
export const checkSendAmount = (environment: ExampleEnvironment, token: string, amountText: string): string | null => {
  if (environment !== 'production' || !amountText.trim()) return null;
  const units = usdTextToUnits(amountText);
  return refuseSend(environment, token, units === null ? null : ceilCents(units, USD_DECIMALS));
};

/** What a quote makes leave: the unwrapped token when it unwraps, otherwise the pay token. */
export const leaves = (quote: Pick<SendQuote, 'unwrap' | 'payToken' | 'payUnits'>): {token: string; units: string} =>
  quote.unwrap ? {token: quote.unwrap.token, units: quote.unwrap.units} : {token: quote.payToken, units: quote.payUnits};

/** At Send and Resume: what leaves, valued by its row in fresh balances. A token missing there is refused. */
export const capForQuote = (
  environment: ExampleEnvironment,
  quote: Pick<SendQuote, 'unwrap' | 'payToken' | 'payUnits'>,
  balances: readonly CryptoBalance[],
): string | null => {
  if (environment !== 'production') return null;
  const {token, units} = leaves(quote);
  const row = balances.find((b) => b.token.toLowerCase() === token.toLowerCase());
  if (!row) return NOT_HELD;
  const readable = /^\d+$/.test(units) && Number.isInteger(row.decimals) && row.decimals >= 0 && row.decimals <= 36;
  return refuseSend(environment, row.symbol, readable ? ceilCents(BigInt(units), row.decimals) : null);
};
