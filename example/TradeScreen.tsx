/**
 * Trade — a stock or coin trade through the SDK's `Trade` surface, signed with the test user's key.
 * The panels, buttons and wording match the iOS, Android and Flutter examples. A full trade runs on
 * production only, and the example refuses one worth more than 10 USD there.
 */
import React, {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import type {
  TradeAccount,
  TradeCatalogItem,
  TradeMarket,
  TradeOpenOrder,
  TradeOrder,
  TradeQuote,
  TradeSide,
  TradeStepEvent,
} from '@wirexapp/mobile-sdk';

import {diag} from './diagLog';
import {onConfigChange} from './exampleConfig';
import {radius, T} from './theme';
import {checkBuyAmount, checkTerms} from './tradeGuards';
import {buildExampleTrade, tradeKey, type BuiltTrade} from './tradeSdk';
import {errorLine, quoteForResume, showTime, showUnits, stepLogLine} from './tradeView';

type StepRow = {step: string; state: string; status?: string; reason?: string};
type Panel = 'account' | 'catalog' | 'quote' | 'trade' | 'open';

export default function TradeScreen(): React.JSX.Element {
  const built = useRef<BuiltTrade>(buildExampleTrade());
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Panel, string>>>({});
  const [account, setAccount] = useState<TradeAccount | null>(null);
  const [catalog, setCatalog] = useState<TradeCatalogItem[] | null>(null);
  const [market, setMarket] = useState<TradeMarket>('stock');
  const [side, setSide] = useState<TradeSide>('buy');
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [order, setOrder] = useState<TradeOrder | null>(null);
  const [openOrders, setOpenOrders] = useState<TradeOpenOrder[] | null>(null);

  // One Trade per environment, chain and key address; anything shown for the old one goes with it.
  useEffect(
    () =>
      onConfigChange(() => {
        if (tradeKey() === built.current.key) return;
        built.current = buildExampleTrade();
        diag('sdk', `trade: rebuilt${built.current.error ? ' (not ready)' : ''}`);
        force();
        setErrors({});
        setAccount(null);
        setCatalog(null);
        setQuote(null);
        setSteps([]);
        setOrder(null);
        setOpenOrders(null);
      }),
    [],
  );

  const {trade, environment} = built.current;
  // SECURITY: the cap reads the environment the Trade in use was built for.
  const amountRefusal = checkBuyAmount(environment, side, amount);
  const quoteRefusal = quote ? checkTerms(environment, quote) : null;

  const run = useCallback(async (panel: Panel, label: string, call: () => Promise<void>): Promise<void> => {
    diag('tap', label);
    diag('sdk', `trade: ${label} started`);
    setBusy(label);
    setErrors((prev) => ({...prev, [panel]: undefined}));
    try {
      await call();
      diag('sdk', `trade: ${label} done`);
    } catch (e) {
      const reason = (e as {reason?: unknown}).reason;
      diag('err', `trade: ${label} failed${typeof reason === 'string' ? ` ${reason}` : ''}`);
      setErrors((prev) => ({...prev, [panel]: errorLine(e)}));
    } finally {
      setBusy(null);
    }
  }, []);

  const onStep = useCallback((event: TradeStepEvent) => {
    diag('sdk', stepLogLine(event));
    setSteps((prev) => {
      const row = {step: event.step, state: event.state, status: event.status, reason: event.reason};
      const at = prev.findIndex((r) => r.step === event.step);
      return at < 0 ? [...prev, row] : prev.map((r, i) => (i === at ? row : r));
    });
  }, []);

  const readAccount = () => run('account', 'Read account', async () => setAccount(await trade!.account()));
  const setUp = () =>
    run('account', 'Set up account', async () => {
      setSteps([]);
      setAccount(await trade!.setUpAccount({onStep}));
    });
  const loadCatalog = () => run('catalog', 'Load catalog', async () => setCatalog(await trade!.catalog()));
  const getQuote = () =>
    run('quote', 'Get quote', async () => {
      setQuote(null);
      setQuote(await trade!.quote({market, side, symbol: symbol.trim(), amount: amount.trim()}));
    });
  const execute = () =>
    run('trade', 'Execute', async () => {
      // SECURITY: checked again at the moment of sending, whatever the buttons showed.
      const refusal = checkTerms(built.current.environment, quote!);
      if (refusal) throw new Error(refusal);
      setSteps([]);
      setOrder(null);
      setOrder(await trade!.execute(quote!, {onStep}));
    });
  const loadOpenOrders = () => run('open', 'Load open orders', async () => setOpenOrders(await trade!.openOrders()));
  const resume = (open: TradeOpenOrder) =>
    run('trade', 'Resume', async () => {
      // SECURITY: an open order's terms get the same cap; the order carries no transfer fee.
      const refusal = checkTerms(built.current.environment, open);
      if (refusal) throw new Error(refusal);
      setSteps([]);
      setOrder(null);
      setOrder(await trade!.resume(open.orderId, quoteForResume(open, quote), {onStep}));
    });

  const pickSymbol = (item: TradeCatalogItem) => {
    diag('tap', `catalog ${item.market} symbol`);
    setMarket(item.market);
    setSymbol(item.symbol);
    setQuote(null);
  };

  const isIdle = busy === null && trade !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Trade</Text>
      <Text style={styles.caption}>
        Stocks and coins through the SDK, signed with the owner key from the Config tab. A full trade runs on
        production only, with small real amounts; the example refuses a trade worth more than 10 USD there.
      </Text>
      {built.current.error ? <Text style={[styles.hint, styles.error, styles.top]}>{built.current.error}</Text> : null}
      {busy ? <Text style={[styles.hint, styles.top]}>{busy}…</Text> : null}

      <Text style={styles.section}>Account</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>The main account's chain, both addresses, and whether the investment account is ready.</Text>
        <View style={styles.row}>
          <Action label="Read account" isDisabled={!isIdle} onPress={readAccount} />
          <Action label="Set up account" isDisabled={!isIdle} onPress={setUp} />
        </View>
        <ErrorText text={errors.account} />
        {account ? (
          <View style={styles.list}>
            <Line label="Chain" value={String(account.chainId)} />
            <Line label="Main account" value={account.mainAccount} />
            <Line label="Investment account" value={account.investmentAccount ?? '—'} />
            <Line label="Set up" value={account.isSetUp ? 'yes' : 'no'} />
            <Line label="Cash" value={account.cash ? `${showUnits(account.cash.units, account.cash.decimals)} USDC` : '—'} />
            {account.holdings.map((h) => (
              <Line
                key={h.token}
                label={`${h.symbol} (${h.market})`}
                value={`${h.sharesShown ?? showUnits(h.units, h.decimals)}${h.valueCents ? ` · ${showUnits(h.valueCents, 2)} USD` : ''}`}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.section}>Catalog</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>Stock and coin symbols. A company with its own tokens lists no coins. Tap one to quote it.</Text>
        <View style={styles.row}>
          <Action label="Load catalog" isDisabled={!isIdle} onPress={loadCatalog} />
        </View>
        <ErrorText text={errors.catalog} />
        {catalog ? (
          <View style={styles.row}>
            {catalog.length === 0 ? <Text style={styles.hint}>No symbols.</Text> : null}
            {catalog.map((item) => (
              <Chip key={`${item.market}:${item.token}`} label={`${item.symbol} · ${item.market}`} isOn={item.symbol === symbol && item.market === market} onPress={() => pickSymbol(item)} />
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.section}>Quote</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          {(['stock', 'coin'] as TradeMarket[]).map((m) => (
            <Chip key={m} label={m} isOn={market === m} onPress={() => { diag('tap', `market chip ${m}`); setMarket(m); }} />
          ))}
        </View>
        <View style={styles.row}>
          {(['buy', 'sell'] as TradeSide[]).map((s) => (
            <Chip key={s} label={s} isOn={side === s} onPress={() => { diag('tap', `side chip ${s}`); setSide(s); }} />
          ))}
        </View>
        <Text style={styles.label}>Symbol</Text>
        <TextInput style={styles.input} value={symbol} onChangeText={setSymbol} autoCapitalize="characters" autoCorrect={false} placeholder="from the catalog" placeholderTextColor={T.textFaint} />
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.hint}>{side === 'buy' ? 'USD to spend' : 'Tokens to sell'}</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoCorrect={false} placeholderTextColor={T.textFaint} />
        <ErrorText text={amountRefusal ?? undefined} />
        <View style={styles.row}>
          <Action label="Get quote" isDisabled={!isIdle || amountRefusal !== null} onPress={getQuote} />
        </View>
        <ErrorText text={errors.quote} />
        {quote ? (
          <View style={styles.list}>
            <Line label="Order" value={quote.orderId} />
            <Line label="Trade" value={`${quote.side} ${quote.symbol} (${quote.market}, ${quote.executionMethod})`} />
            <Line label="Amount in" value={showUnits(quote.amountIn, quote.tokenInDecimals)} />
            <Line label="Estimated out" value={showUnits(quote.estimatedAmountOut, quote.tokenOutDecimals)} />
            <Line label="Minimum out" value={showUnits(quote.minimumAmountOut, quote.tokenOutDecimals)} />
            {quote.estimatedShares ? <Line label="Estimated shares" value={showUnits(quote.estimatedShares, quote.side === 'buy' ? quote.tokenOutDecimals : quote.tokenInDecimals)} /> : null}
            <Line label="Fee (base units)" value={quote.feeAmount} />
            <Line label="Transfer fee" value={quote.transferFee ? `${showUnits(quote.transferFee, 6)} USDC` : '—'} />
            <Line label="Sign by" value={showTime(quote.signBy)} />
            <Line label="Valid until" value={showTime(quote.validUntil)} />
          </View>
        ) : null}
        <ErrorText text={quoteRefusal ?? undefined} />
      </View>

      <Text style={styles.section}>Trade</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>Every step and its status, until the order ends.</Text>
        <View style={styles.row}>
          <Action label="Execute" isDisabled={!isIdle || !quote || quoteRefusal !== null} onPress={execute} />
        </View>
        {steps.length ? (
          <View style={styles.list}>
            {steps.map((s) => (
              <Line key={s.step} label={s.step} value={[s.state, s.status, s.reason].filter(Boolean).join(' · ')} />
            ))}
          </View>
        ) : null}
        <ErrorText text={errors.trade} />
        {order ? <OrderLines order={order} /> : null}
      </View>

      <Text style={styles.section}>Open orders</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>A trade carries on after the app is killed.</Text>
        <View style={styles.row}>
          <Action label="Load open orders" isDisabled={!isIdle} onPress={loadOpenOrders} />
        </View>
        <ErrorText text={errors.open} />
        {openOrders && openOrders.length === 0 ? <Text style={styles.hint}>No open orders.</Text> : null}
        {openOrders?.map((open) => {
          const refusal = checkTerms(environment, open);
          return (
            <View key={open.orderId} style={styles.list}>
              <Line label="Order" value={open.orderId} />
              <Line label="Trade" value={`${open.side} (${open.market}) · ${open.status}`} />
              <Line label="Next step" value={open.nextStep ?? '—'} />
              <Line label="Created" value={showTime(open.createdAt)} />
              <ErrorText text={refusal ?? undefined} />
              <View style={styles.row}>
                <Action label="Resume" isDisabled={!isIdle || refusal !== null || open.nextStep === null} onPress={() => resume(open)} />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function OrderLines({order}: {order: TradeOrder}): React.JSX.Element {
  return (
    <View style={styles.list}>
      <Line label="Order" value={order.orderId} />
      <Line label="Status" value={`${order.status}${order.statusReason ? ` · ${order.statusReason}` : ''}`} />
      <Line label="Amount in" value={showUnits(order.amountIn, order.tokenInDecimals)} />
      <Line label="Amount out" value={showUnits(order.amountOut, order.tokenOutDecimals)} />
      <Line label="Refunded" value={showUnits(order.refundedAmount, order.tokenInDecimals)} />
      {order.shares ? <Line label="Shares" value={order.shares} /> : null}
      <Line label="Transaction" value={order.transactionHash ?? '—'} />
      <Line label="Created" value={showTime(order.createdAt)} />
      <Line label="Updated" value={showTime(order.updatedAt)} />
    </View>
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
  input: {borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: T.text, backgroundColor: T.surfaceAlt},
  chip: {paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface},
  chipOn: {backgroundColor: T.accent, borderColor: T.accent},
  chipText: {color: T.textDim, fontWeight: '700'},
  chipTextOn: {color: T.onAccent},
  action: {paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: T.accent},
  actionText: {color: T.onAccent, fontWeight: '800'},
  disabled: {opacity: 0.5},
});
