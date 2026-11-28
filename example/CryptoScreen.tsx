/**
 * Crypto — a send from the main account to any network, and a deposit address, through the SDK's `Crypto`
 * surface, signed with the test user's key. The panels, buttons and wording match the other example apps.
 * On production the example refuses a send worth more than 10 USD.
 */
import React, {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import type {
  Crypto,
  CryptoBalance,
  CryptoStepEvent,
  DepositAddress,
  PendingSend,
  SendNetwork,
  SendQuote,
  SendResult,
  SendStatus,
  WalletFamily,
} from '@wirexapp/mobile-sdk';

import {buildExampleCrypto, type BuiltCrypto} from './cryptoSdk';
import {capForQuote, checkSendAmount, leaves} from './cryptoGuards';
import {CRYPTO_HINTS, cryptoStepLogLine, heldFor, holdQuote, isDeliveryCheckable, showUnixTime} from './cryptoView';
import {diag} from './diagLog';
import {onConfigChange} from './exampleConfig';
import {radius, T} from './theme';
import {tradeKey} from './tradeSdk';
import {errorLine, showUnits} from './tradeView';

const NETWORKS: readonly SendNetwork[] = ['ARC', 'BASE', 'ETHEREUM', 'ARBITRUM', 'OPTIMISM', 'AVALANCHE', 'MATIC_POS', 'BINANCE', 'TRON', 'SOLANA'];
const FAMILIES: readonly WalletFamily[] = ['EVM', 'TRX', 'SOL', 'XLM', 'BTC'];
const PROVIDERS = ['any', 'cctp', 'rhino', 'across'] as const;
type Provider = (typeof PROVIDERS)[number];
type Panel = 'balances' | 'send' | 'pending' | 'deposit';
type StepRow = {step: string; state: string; reason?: string; transactionHash?: string};

export default function CryptoScreen(): React.JSX.Element {
  const built = useRef<BuiltCrypto>(buildExampleCrypto());
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Panel, string>>>({});
  const [balances, setBalances] = useState<CryptoBalance[] | null>(null);
  const [network, setNetwork] = useState<SendNetwork>('BASE');
  const [token, setToken] = useState('USDC');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<Provider>('any');
  const [quote, setQuote] = useState<SendQuote | null>(null);
  // Every quote this run made, in memory only, so a pending row can find its own.
  const held = useRef<SendQuote[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [result, setResult] = useState<SendResult | null>(null);
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [pending, setPending] = useState<PendingSend[] | null>(null);
  const [family, setFamily] = useState<WalletFamily>('EVM');
  const [deposit, setDeposit] = useState<DepositAddress | null>(null);

  // One Crypto per environment, chain and key address; its quotes and everything shown go with the old one.
  useEffect(
    () =>
      onConfigChange(() => {
        if (tradeKey() === built.current.key) return;
        built.current = buildExampleCrypto();
        diag('sdk', `crypto: rebuilt${built.current.error ? ' (not ready)' : ''}`);
        held.current = [];
        setErrors({});
        setBalances(null);
        setQuote(null);
        setSteps([]);
        setResult(null);
        setStatus(null);
        setPending(null);
        setDeposit(null);
        force();
      }),
    [],
  );

  const {crypto, environment} = built.current;
  const amountRefusal = checkSendAmount(environment, token, amount);

  const run = useCallback(async (panel: Panel, label: string, call: (engine: Crypto) => Promise<void>): Promise<void> => {
    const engine = built.current.crypto;
    if (!engine) return;
    diag('tap', label);
    diag('sdk', `crypto: ${label} started`);
    setBusy(label);
    setErrors((prev) => ({...prev, [panel]: undefined}));
    try {
      await call(engine);
      diag('sdk', `crypto: ${label} done`);
    } catch (e) {
      const reason = (e as {reason?: unknown}).reason;
      diag('err', `crypto: ${label} failed${typeof reason === 'string' ? ` ${reason}` : ''}`);
      setErrors((prev) => ({...prev, [panel]: errorLine(e, CRYPTO_HINTS)}));
    } finally {
      setBusy(null);
    }
  }, []);

  const onStep = useCallback((event: CryptoStepEvent) => {
    diag('sdk', cryptoStepLogLine(event));
    setSteps((prev) => {
      const row = {step: event.step, state: event.state, reason: event.reason, transactionHash: event.transactionHash};
      const at = prev.findIndex((r) => r.step === event.step);
      return at < 0 ? [...prev, row] : prev.map((r, i) => (i === at ? row : r));
    });
  }, []);

  // SECURITY: what the quote makes leave is valued on fresh balances, at the moment of sending.
  const refuseByCap = async (engine: Crypto, subject: SendQuote): Promise<void> => {
    const rows = await engine.balances();
    setBalances(rows);
    const refusal = capForQuote(built.current.environment, subject, rows);
    if (refusal) throw new Error(refusal);
  };

  const readBalances = () => run('balances', 'Read balances', async (engine) => setBalances(await engine.balances()));
  const getQuote = () =>
    run('send', 'Get quote', async (engine) => {
      setQuote(null);
      const made = await engine.quoteSend({to, network, token: token.trim(), amount: amount.trim(), provider: provider === 'any' ? null : provider});
      held.current = holdQuote(held.current, made);
      setQuote(made);
    });
  const send = () =>
    run('send', 'Send', async (engine) => {
      await refuseByCap(engine, quote!);
      setSteps([]);
      setResult(null);
      setStatus(null);
      setResult(await engine.send(quote!, {onStep}));
    });
  const checkDelivery = () => run('send', 'Check delivery', async (engine) => setStatus(await engine.sendStatus(result!)));
  const loadPending = () => run('pending', 'Load pending', async (engine) => setPending(await engine.pendingSends()));
  const resume = (heldQuote: SendQuote) =>
    run('pending', 'Resume', async (engine) => {
      // SECURITY: a resume still sends the execute, so the same cap applies to the held quote.
      await refuseByCap(engine, heldQuote);
      setSteps([]);
      setResult(null);
      setStatus(null);
      setResult(await engine.resumeSend(heldQuote.sendId, heldQuote, {onStep}));
    });
  const getDeposit = () =>
    run('deposit', 'Get deposit address', async (engine) => {
      setDeposit(null);
      setDeposit(await engine.depositAddress({family}));
    });

  const isIdle = busy === null && crypto !== null;
  // A balance row gives the decimals of what leaves; to another network the amounts are at 6.
  const quoteDecimals = (q: SendQuote): number | null =>
    q.rail !== 'transfer' ? 6 : balances?.find((b) => b.token.toLowerCase() === q.payToken.toLowerCase())?.decimals ?? null;
  const shown = (units: string, decimals: number | null): string => (decimals === null ? `${units} (base units)` : showUnits(units, decimals));
  const shownLeaving = (q: SendQuote): string => {
    const out = leaves(q);
    const row = balances?.find((b) => b.token.toLowerCase() === out.token.toLowerCase());
    return `${row ? `${showUnits(out.units, row.decimals)} ${row.symbol}` : `${out.units} (base units)`}${q.unwrap ? ' (unwrapped first)' : ''}`;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Crypto</Text>
      <Text style={styles.caption}>
        Sends from the main account to any network, and deposit addresses, signed with the owner key from the Config
        tab. On production every send spends real money, and the example refuses one worth more than 10 USD.
      </Text>
      {built.current.error ? <Text style={[styles.hint, styles.error, styles.top]}>{built.current.error}</Text> : null}
      {busy ? <Text style={[styles.hint, styles.top]}>{busy}…</Text> : null}

      <Text style={styles.section}>Balances</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <Action label="Read balances" isDisabled={!isIdle} onPress={readBalances} />
        </View>
        <ErrorText text={errors.balances} />
        {balances && balances.length === 0 ? <Text style={styles.hint}>No balances.</Text> : null}
        {balances && balances.length ? (
          <View style={styles.list}>
            {balances.map((b) => (
              <Line key={b.token} label={b.symbol} value={`${showUnits(b.units, b.decimals)} · ${b.token}`} />
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.section}>Send</Text>
      <View style={styles.group}>
        <Text style={styles.label}>Network</Text>
        <View style={styles.row}>
          {NETWORKS.map((n) => (
            <Chip key={n} label={n} isOn={network === n} onPress={() => { diag('tap', `network chip ${n}`); setNetwork(n); }} />
          ))}
        </View>
        <Text style={styles.label}>Token</Text>
        <TextInput style={styles.input} value={token} onChangeText={setToken} autoCapitalize="characters" autoCorrect={false} placeholder="USDC" placeholderTextColor={T.textFaint} />
        <Text style={styles.label}>Recipient</Text>
        <TextInput style={styles.input} value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="the address on that network" placeholderTextColor={T.textFaint} />
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.hint}>What arrives; the fee comes on top</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoCorrect={false} placeholder="1.00" placeholderTextColor={T.textFaint} />
        <Text style={styles.label}>Provider (optional)</Text>
        <View style={styles.row}>
          {PROVIDERS.map((p) => (
            <Chip key={p} label={p} isOn={provider === p} onPress={() => { diag('tap', `provider chip ${p}`); setProvider(p); }} />
          ))}
        </View>
        <ErrorText text={amountRefusal ?? undefined} />
        <View style={styles.row}>
          <Action label="Get quote" isDisabled={!isIdle || !to.trim() || !amount.trim() || amountRefusal !== null} onPress={getQuote} />
        </View>
        {quote ? (
          <View style={styles.list}>
            <Line label="Send" value={quote.sendId} />
            <Line label="Rail" value={quote.rail} />
            <Line label="To" value={`${quote.to} on ${quote.network}`} />
            <Line label="Arrives" value={`${shown(quote.amount, quoteDecimals(quote))} ${quote.token}`} />
            <Line label="Fee" value={shown(quote.fee, quoteDecimals(quote))} />
            <Line label="Leaves" value={shownLeaving(quote)} />
            <Line label="Valid until" value={showUnixTime(quote.validUntil)} />
          </View>
        ) : null}
        <View style={styles.row}>
          <Action label="Send" isDisabled={!isIdle || !quote} onPress={send} />
          {isDeliveryCheckable(result) ? <Action label="Check delivery" isDisabled={!isIdle} onPress={checkDelivery} /> : null}
        </View>
        {steps.length ? (
          <View style={styles.list}>
            {steps.map((s) => (
              <Line key={s.step} label={s.step} value={[s.state, s.reason, s.transactionHash].filter(Boolean).join(' · ')} />
            ))}
          </View>
        ) : null}
        <ErrorText text={errors.send} />
        {result ? (
          <Text style={[styles.hint, styles.ok]} selectable>
            {`Sent by ${result.rail}${result.transactionHash ? ` · ${result.transactionHash}` : ' · the execute ran before'}`}
          </Text>
        ) : null}
        {status ? (
          <Text style={[styles.hint, status.state === 'not_delivered' ? styles.error : status.state === 'delivered' ? styles.ok : null]} selectable>
            {[
              status.state,
              status.vendorState,
              status.destinationTxHash,
              status.refund ? `refund ${[status.refund.amount, status.refund.token, status.refund.network].filter(Boolean).join(' ')}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>

      <Text style={styles.section}>Pending</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>
          Quotes are held in memory only: after the app is killed, no row finds its quote and the send expires by itself.
        </Text>
        <View style={styles.row}>
          <Action label="Load pending" isDisabled={!isIdle} onPress={loadPending} />
        </View>
        <ErrorText text={errors.pending} />
        {pending && pending.length === 0 ? <Text style={styles.hint}>No pending sends.</Text> : null}
        {pending?.map((row) => {
          const heldQuote = heldFor(row, held.current);
          return (
            <View key={row.hash} style={styles.list}>
              <Line label="Amount" value={showUnits(row.units, row.decimals)} />
              <Line label="To" value={row.destination} />
              <Line label="Due" value={showUnixTime(row.validAfter)} />
              <Line label="Valid until" value={showUnixTime(row.validBefore)} />
              {heldQuote ? null : <Text style={styles.hint}>no quote held for this send</Text>}
              <View style={styles.row}>
                <Action label="Resume" isDisabled={!isIdle || heldQuote === null} onPress={() => heldQuote && resume(heldQuote)} />
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.section}>Deposit</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          {FAMILIES.map((f) => (
            <Chip key={f} label={f} isOn={family === f} onPress={() => { diag('tap', `family chip ${f}`); setFamily(f); }} />
          ))}
        </View>
        <View style={styles.row}>
          <Action label="Get deposit address" isDisabled={!isIdle} onPress={getDeposit} />
        </View>
        <ErrorText text={errors.deposit} />
        {deposit ? (
          <View style={styles.list}>
            <Line label={deposit.family} value={deposit.address} />
            {deposit.networks.flatMap((n) =>
              n.tokens.map((t) => <Line key={`${n.network}:${t.symbol}`} label={`${n.network} ${t.symbol}`} value={`${t.minUsd} – ${t.maxUsd} USD`} />),
            )}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Line({label, value}: {label: string; value: string}): React.JSX.Element {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} selectable>{value}</Text>
    </View>
  );
}

function ErrorText({text}: {text?: string}): React.JSX.Element | null {
  return text ? <Text style={[styles.hint, styles.error]}>{text}</Text> : null;
}

function Action({label, isDisabled, onPress}: {label: string; isDisabled: boolean; onPress: () => void}): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.action, isDisabled && styles.disabled]} disabled={isDisabled} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({label, isOn, onPress}: {label: string; isOn: boolean; onPress: () => void}): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.chip, isOn && styles.chipOn]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  content: {padding: 16, paddingBottom: 48},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  caption: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  section: {fontSize: 12, fontWeight: '800', color: T.textFaint, marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8},
  group: {backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: 14, gap: 12},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  list: {gap: 6, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 10},
  line: {flexDirection: 'row', gap: 10},
  lineLabel: {width: 130, fontSize: 12, color: T.textFaint},
  lineValue: {flex: 1, fontSize: 12, color: T.text},
  label: {fontSize: 14, fontWeight: '700', color: T.text},
  hint: {fontSize: 12, color: T.textFaint, marginTop: 1},
  top: {marginTop: 10},
  error: {color: T.pink},
  ok: {color: T.green},
  input: {borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: T.text, backgroundColor: T.surfaceAlt},
  chip: {paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface},
  chipOn: {backgroundColor: T.accent, borderColor: T.accent},
  chipText: {color: T.textDim, fontWeight: '700', fontSize: 12},
  chipTextOn: {color: T.onAccent},
  action: {paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: T.accent},
  actionText: {color: T.onAccent, fontWeight: '800'},
  disabled: {opacity: 0.5},
});
