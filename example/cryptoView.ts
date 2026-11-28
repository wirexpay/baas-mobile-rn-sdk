import type {CryptoStepEvent, PendingSend, SendQuote, SendResult} from '@wirexapp/mobile-sdk';

/** The hints every example app shows next to these Crypto reasons. */
export const CRYPTO_HINTS: Partial<Record<string, string>> = {
  invalid_address: 'the recipient is not an address of that network',
  recipient_is_account: 'the recipient is the main account itself',
  insufficient_funds: 'the main account cannot cover the send',
  quote_expired: 'get a new quote',
  quote_mismatch: "the quote is not this send's",
  over_limit: 'try a smaller amount',
  amount_too_small: 'try a larger amount',
  bridge_unavailable: 'the bridge is unavailable: try again later',
  rhino_key_missing: 'the company has no rhino.fi key',
  deposit_unavailable: 'no deposit network is left: ask again later',
  signer_mismatch: 'the key does not own this account',
  token_unavailable: 'sign in again',
};

/** Holds a quote in memory, replacing an older one of the same send. */
export const holdQuote = (held: readonly SendQuote[], quote: SendQuote): SendQuote[] => [
  ...held.filter((q) => q.sendId !== quote.sendId),
  quote,
];

/** The held quote of a pending row: a row carries no sendId, so it matches by requestHash, in lower case. */
export const heldFor = (row: Pick<PendingSend, 'hash'>, held: readonly SendQuote[]): SendQuote | null =>
  held.find((q) => q.requestHash.toLowerCase() === row.hash.toLowerCase()) ?? null;

/** A delivery can be read only off the transfer rail, which lands with the execute itself. */
export const isDeliveryCheckable = (result: Pick<SendResult, 'rail'> | null): boolean => result !== null && result.rail !== 'transfer';

/** A step for the diagnostic log: its name, state and reason. Never a hash, an address or an amount. */
export const cryptoStepLogLine = (event: CryptoStepEvent): string =>
  `crypto: step ${event.step} ${event.state}${event.reason ? ` reason=${event.reason}` : ''}`;

/** Unix seconds as a local time for the screen, or a dash. */
export const showUnixTime = (value: string | null | undefined): string => {
  if (!value || !/^\d+$/.test(value)) return value || '—';
  return new Date(Number(value) * 1000).toLocaleTimeString();
};
