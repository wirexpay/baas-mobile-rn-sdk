/**
 * Wallet top-up — the Wirex-hosted Apple Pay / Google Pay checkout, embedded.
 *
 *  - legacy: the sheet tokenises and `onEvent` yields a `token`; your backend executes.
 *  - token mode: set a `checkoutToken` on the Config tab → the frame executes and reports
 *    `executing` / `executed` / `executeFailed`; no token crosses.
 *
 * Reads amount / currency / provider from the Config tab. The estimationId and the provider block are
 * per-transaction — paste them from a real estimate on your backend.
 *
 * REAL DEVICE ONLY: Apple Pay / Google Pay cannot present on the iOS Simulator (no provisioned card,
 * no Secure Element). `useWalletAvailability` (the SDK's native canMakePayments probe) reports this —
 * on the simulator it returns false and the banner says so. The checkout still ARMS with a valid
 * quote + provider config; only the Pay sheet itself needs a device.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';

import {
  WirexWalletAvailabilityProbe,
  WirexWalletCheckoutView,
  buildWalletLaunchUrl,
  isWalletReturnLink,
  parseWalletReturnLink,
  useWalletAvailability,
  type WirexWalletCheckoutEvent,
  type WirexWalletProviderConfig,
} from '@wirexapp/mobile-sdk';

import {describeError, diag} from './diagLog';
import {fetchTopUpEstimate, getSecret, getSettings, onConfigChange} from './exampleConfig';
import {radius, T} from './theme';

// Starter provider block. It has no `probe_url` / `checkout_url`, so the availability probe cannot run
// against it — paste the real `topup.providers.<name>` block from your app config to arm the checkout
// and let the probe resolve.
const PLACEHOLDER_PROVIDER = '{ "google_pay": {}, "apple_pay": {} }';

// Demo App Link the Android checkout returns to. A real host uses its own verified domain
// (assetlinks.json) so the tab hands straight back to the app; this declares the example's demo host
// (see android/app/src/main/AndroidManifest.xml).
const RETURN_URL = 'https://wirex-sdk-example.wirexapp.tech/wallet-return';

export default function WalletScreen(): React.JSX.Element {
  const settings = getSettings();
  // Seeded from the Config tab (`estimationId`, which a seed link can carry); "Fetch estimate" overwrites it.
  const [estimationId, setEstimationId] = useState(settings.estimationId);
  useEffect(() => onConfigChange(() => { const seeded = getSettings().estimationId; if (seeded) setEstimationId(seeded); }), []);
  const [providerJson, setProviderJson] = useState(PLACEHOLDER_PROVIDER);
  const [tokenMode, setTokenMode] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  // "Fetch estimate" prices a top-up with the BaaS API (your backend's job) using the bearer on the
  // Config tab — a quick way to verify your token and fill the estimation id without a backend.
  const [estimateMsg, setEstimateMsg] = useState('');
  const fetchEstimate = async (): Promise<void> => {
    diag('tap', 'Fetch estimate');
    setEstimateMsg('fetching estimate…');
    try {
      const id = await fetchTopUpEstimate();
      diag('sdk', `wallet: estimate loaded (${id.length} chars)`);
      setEstimationId(id);
      setEstimateMsg(`estimate ${id.slice(0, 8)}… loaded`);
    } catch (e) {
      diag('err', `wallet: estimate failed: ${describeError(e)}`);
      setEstimateMsg(`estimate failed: ${String(e)}`);
    }
  };

  const providerConfig = useMemo<WirexWalletProviderConfig | null>(() => {
    try {
      return JSON.parse(providerJson) as WirexWalletProviderConfig;
    } catch {
      return null;
    }
  }, [providerJson]);

  const log = (event: WirexWalletCheckoutEvent) => {
    diag('sdk', `wallet: event ${event.type}`);
    setEvents((prev) => [event.type, ...prev].slice(0, 12));
  };
  const pushEvent = useCallback((line: string) => {
    diag('sdk', `wallet: ${line}`);
    setEvents((prev) => [line, ...prev].slice(0, 12));
  }, []);
  const ready = Boolean(estimationId.trim() && providerConfig);
  const checkoutToken = getSecret('checkoutToken');

  // Android: the checkout opens TOP-LEVEL in a Chrome Custom Tab, never a WebView — Google Pay validates
  // the hosting app's package, which a WebView cannot satisfy. The SDK builds the URL
  // (`buildWalletLaunchUrl`, token in the fragment); the app opens the tab and reads the return App Link.
  const readReturn = useCallback(
    (url: string | null) => {
      if (!url || !isWalletReturnLink(url, RETURN_URL)) return;
      const back = parseWalletReturnLink(url);
      pushEvent(`return outcome=${back.outcome ?? 'unknown'}`);
    },
    [pushEvent],
  );
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = Linking.addEventListener('url', ({url}) => {
      readReturn(url);
      void InAppBrowser.close();
    });
    return () => sub.remove();
  }, [readReturn]);

  const launchCustomTab = useCallback(async () => {
    diag('tap', `Launch in Custom Tab (provider config ${providerConfig ? 'ok' : 'INVALID'}, estimationId ${estimationId.trim() ? 'set' : 'EMPTY'}, checkoutToken ${checkoutToken ? 'set' : 'EMPTY'})`);
    if (!providerConfig || !estimationId.trim()) return;
    if (!checkoutToken) {
      pushEvent('set a checkout token on Config');
      return;
    }
    const url = buildWalletLaunchUrl(
      {environment: settings.environment, clientId: settings.clientId || undefined},
      {
        checkoutToken,
        quote: {estimationId: estimationId.trim(), sourceAmount: {amount: settings.walletAmount, currency: settings.walletCurrency}},
        provider: settings.walletProvider,
        returnUrl: RETURN_URL,
      },
    );
    // The fragment carries the token — log only the part before it.
    pushEvent(`opening Custom Tab: ${url.split('#')[0]}#<redacted>`);
    try {
      if (await InAppBrowser.isAvailable()) {
        await InAppBrowser.open(url, {showTitle: false, enableUrlBarHiding: true});
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      pushEvent(`launch failed: ${String(e)}`);
    }
  }, [providerConfig, estimationId, checkoutToken, settings, pushEvent]);

  // The SDK's own probe (native canMakePayments). This is how a host decides whether to show a Pay
  // button — and it is the honest "is this a real device" check: on the iOS Simulator (and on a
  // device with no provisioned card) both come back false, because Apple/Google Pay cannot present.
  const availability = useWalletAvailability(
    {environment: settings.environment, clientId: settings.clientId || undefined},
    {providerConfig: providerConfig ?? undefined},
  );
  const payAvailable = Boolean(availability?.applePay || availability?.googlePay);
  useEffect(() => {
    if (availability != null) diag('sdk', `wallet: availability applePay=${String(availability.applePay)} googlePay=${String(availability.googlePay)}`);
  }, [availability]);
  // The probe (mounted below) loads a hidden frame and runs native canMakePayments; that takes a moment,
  // and on the iOS Simulator (no Secure Element) it never resolves at all. Give it a generous window
  // before concluding "no Pay here", so a real device is not libelled as unavailable mid-probe.
  const [probeTimedOut, setProbeTimedOut] = useState(false);
  useEffect(() => {
    if (availability != null) {
      setProbeTimedOut(false);
      return undefined;
    }
    const t = setTimeout(() => setProbeTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [availability]);

  // The inset grows with the keyboard, so the bottom of the page scrolls into view; a drag takes the keyboard down.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <View style={styles.headRow}>
        <Text style={styles.title}>Wallet top-up</Text>
        <View style={styles.amountPill}>
          <Text style={styles.amountText}>{settings.walletAmount} {settings.walletCurrency}</Text>
        </View>
      </View>
      <Text style={styles.sub}>Wirex-hosted Apple Pay / Google Pay. Provider: {settings.walletProvider || '—'}</Text>

      {/* Renders nothing: it runs the native availability probe against the provider block and feeds the
          answer to `useWalletAvailability` above. Without it mounted, the hook has nothing to report. */}
      {providerConfig ? (
        <WirexWalletAvailabilityProbe
          config={{environment: settings.environment, clientId: settings.clientId || undefined}}
          providerConfig={providerConfig}
        />
      ) : null}

      <View style={[styles.banner, payAvailable ? styles.bannerOk : styles.bannerWarn]}>
        <Text style={styles.bannerText}>
          {availability != null
            ? payAvailable
              ? `Pay available: ${[availability.applePay && 'Apple Pay', availability.googlePay && 'Google Pay'].filter(Boolean).join(' · ')}`
              : 'Apple Pay / Google Pay unavailable on this device.'
            : probeTimedOut
              ? 'Apple Pay / Google Pay unavailable here — needs a real device with a provisioned card (the probe never resolves on the iOS Simulator). The checkout below still arms; only the Pay sheet itself needs a device.'
              : 'Checking Apple Pay / Google Pay availability…'}
        </Text>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Estimation ID</Text>
        <Text style={styles.hint}>from your backend's top-up estimate — or Fetch it with your bearer</Text>
        <TextInput style={styles.input} value={estimationId} onChangeText={setEstimationId} autoCapitalize="none" autoCorrect={false} placeholderTextColor={T.textFaint} />
        <TouchableOpacity style={styles.fetchBtn} onPress={() => void fetchEstimate()} activeOpacity={0.85}>
          <Text style={styles.fetchBtnText}>Fetch estimate</Text>
        </TouchableOpacity>
        {estimateMsg ? <Text style={styles.fetchMsg}>{estimateMsg}</Text> : null}

        <Text style={[styles.label, {marginTop: 14}]}>Provider config</Text>
        <Text style={styles.hint}>your app config's topup.providers.&lt;name&gt; block, verbatim</Text>
        <TextInput style={[styles.input, styles.multiline]} value={providerJson} onChangeText={setProviderJson} multiline autoCapitalize="none" autoCorrect={false} placeholderTextColor={T.textFaint} />

        <View style={styles.switchRow}>
          <View style={{flex: 1}}>
            <Text style={styles.label}>Token mode</Text>
            <Text style={styles.hint}>
              off = legacy: the sheet returns a token, your backend executes. on = the frame executes
              itself with a backend-minted checkoutToken (nothing crosses JS).
            </Text>
            {tokenMode && !checkoutToken ? <Text style={styles.warn}>set a checkout token on Config</Text> : null}
          </View>
          <Switch value={tokenMode} onValueChange={(v) => { diag('tap', `Token mode → ${v ? 'on' : 'off'}`); setTokenMode(v); }} trackColor={{true: T.accent, false: T.border}} thumbColor={T.text} />
        </View>
      </View>

      {ready ? (
        Platform.OS === 'android' ? (
          // Android: launch the checkout top-level in a Chrome Custom Tab (not a WebView).
          <View style={styles.group}>
            <Text style={styles.label}>Custom Tab checkout</Text>
            <Text style={styles.hint}>
              Opens top-level in a Chrome Custom Tab — Google Pay validates the app's package, which a WebView
              cannot satisfy. Needs a checkout token on the Config tab.
            </Text>
            <TouchableOpacity style={styles.fetchBtn} onPress={() => void launchCustomTab()} activeOpacity={0.85}>
              <Text style={styles.fetchBtnText}>Launch in Custom Tab</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.checkoutCard}>
            <WirexWalletCheckoutView
              config={{environment: settings.environment, clientId: settings.clientId || undefined}}
              quote={{estimationId: estimationId.trim(), sourceAmount: {amount: settings.walletAmount, currency: settings.walletCurrency}}}
              providerConfig={providerConfig as WirexWalletProviderConfig}
              provider={settings.walletProvider || undefined}
              auth={tokenMode && checkoutToken ? {checkoutToken} : undefined}
              onEvent={log}
            />
          </View>
        )
      ) : (
        <Text style={styles.note}>Enter an estimation id and a valid provider config to arm the checkout.</Text>
      )}

      {events.length ? (
        <>
          <Text style={styles.section}>Events</Text>
          <View style={styles.events}>
            {events.map((e, i) => (
              <View key={`${e}-${i}`} style={styles.eventChip}>
                <Text style={styles.eventText}>{e}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  content: {padding: 16, paddingBottom: 48},
  headRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  sub: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  amountPill: {paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: T.accent},
  amountText: {color: T.onAccent, fontWeight: '800', fontSize: 13},
  banner: {marginTop: 12, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10},
  bannerOk: {backgroundColor: '#3CC65E22', borderColor: T.green},
  bannerWarn: {backgroundColor: '#FF407F22', borderColor: T.pink},
  bannerText: {fontSize: 12.5, color: T.text, lineHeight: 17, fontWeight: '600'},
  group: {marginTop: 16, backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: 14},
  label: {fontSize: 14, fontWeight: '700', color: T.text},
  hint: {fontSize: 12, color: T.textFaint, marginTop: 1},
  warn: {fontSize: 12, color: T.pink, marginTop: 2},
  input: {marginTop: 6, borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, color: T.text, backgroundColor: T.surfaceAlt},
  multiline: {minHeight: 70, textAlignVertical: 'top'},
  fetchBtn: {marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, backgroundColor: T.accent},
  fetchBtnText: {color: T.onAccent, fontWeight: '800', fontSize: 13},
  fetchMsg: {marginTop: 8, color: T.textDim, fontSize: 12},
  switchRow: {flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10},
  checkoutCard: {marginTop: 16, backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, overflow: 'hidden'},
  note: {fontSize: 13, color: T.textDim, marginTop: 16},
  section: {fontSize: 12, fontWeight: '800', color: T.textFaint, marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8},
  events: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  eventChip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: '#3CC65E22', borderWidth: 1, borderColor: T.green},
  eventText: {color: T.text, fontSize: 12, fontWeight: '600'},
});
