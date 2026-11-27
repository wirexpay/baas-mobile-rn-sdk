import type {TradeErrorReason, TradeOrder, TradeQuote, TradeStepEvent} from '@wirexapp/mobile-sdk';

/** The hints every example app shows next to these reasons. */
export const REASON_HINTS: Partial<Record<TradeErrorReason, string>> = {
  signer_mismatch: 'the key does not own this account',
  investment_wallet_required: 'set up the account first',
  quote_expired: 'get a new quote',
  insufficient_funds: 'the main account cannot cover the buy',
  order_not_ended: 'the order is still open: resume it from Open orders',
};

interface TradeErrorFields {
  reason: string;
  step?: string | null;
  routeReason?: string | null;
  detailKey?: string | null;
  httpStatus?: number | null;
  entryPointCode?: string | null;
}

const isTradeError = (e: unknown): e is TradeErrorFields =>
  typeof e === 'object' && e !== null && typeof (e as {reason?: unknown}).reason === 'string';

/** One line: `reason · (hint) · step <step> · route <routeReason> / <detailKey> · HTTP <status> · <entryPointCode>`, each absent part left out. */
export const errorLine = (e: unknown): string => {
  if (!isTradeError(e)) {
    if (!(e instanceof Error)) return String(e);
    return e.name === 'Error' ? e.message : `${e.name}: ${e.message}`;
  }
  const hint = REASON_HINTS[e.reason as TradeErrorReason];
  const route = [e.routeReason, e.detailKey].filter(Boolean).join(' / ');
  return [
    e.reason,
    hint && `(${hint})`,
    e.step && `step ${e.step}`,
    route && `route ${route}`,
    e.httpStatus != null && `HTTP ${e.httpStatus}`,
    e.entryPointCode,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** A step for the diagnostic log: its name, state, order status and reason. Never a hash or an amount. */
export const stepLogLine = (event: TradeStepEvent): string =>
  `trade: step ${event.step} ${event.state}${event.status ? ` status=${event.status}` : ''}${event.reason ? ` reason=${event.reason}` : ''}`;

/** The quote to pass to `resume`: the last one, only when it made this order. */
export const quoteForResume = (order: Pick<TradeOrder, 'orderId'>, lastQuote: TradeQuote | null): TradeQuote | null =>
  lastQuote && lastQuote.orderId === order.orderId ? lastQuote : null;

/** Base units as a decimal, for the screen only. */
export const showUnits = (units: string | null | undefined, decimals: number): string => {
  if (units == null || !/^\d+$/.test(units) || !Number.isInteger(decimals) || decimals < 0) return '—';
  if (decimals === 0) return units;
  const padded = units.padStart(decimals + 1, '0');
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return `${padded.slice(0, -decimals)}${frac ? `.${frac}` : ''}`;
};

/** A time as the SDK answers it, or a dash when it is absent (iOS can answer null). */
export const showTime = (value: string | null | undefined): string => (value ? value : '—');
