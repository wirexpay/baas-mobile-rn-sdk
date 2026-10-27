/**
 * The Config (debug) tab: a form over `exampleConfig`, so QA types every integration parameter and
 * credential straight into the running build — no rebuild, no source edit. One binary, any partner's
 * data.
 *
 * Non-secret settings are plain fields. Secrets (bearer, step-up token, checkout token) are entered the
 * same way but held in memory only; a note says so. "Reset" clears everything back to defaults.
 */
import React, {useEffect, useReducer, useRef, useState} from 'react';
import {Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {clearDiag, diag, diagLines, onDiagChange, shareDiag} from './diagLog';
import {
  type ExampleEnvironment,
  type ExampleSettings,
  applySeedLink,
  getSecret,
  getSettings,
  onConfigChange,
  resetConfig,
  setSecret,
  setSetting,
} from './exampleConfig';
import {radius, T} from './theme';

type FieldKey = keyof ExampleSettings;

const SETTING_FIELDS: {key: FieldKey; label: string; hint?: string}[] = [
  {key: 'chainId', label: 'Chain ID', hint: 'X-Chain-Id — Wirex assigns per integration'},
  {key: 'clientId', label: 'Client ID', hint: 'optional — ?client= on the hosted pages'},
  {key: 'userEmail', label: 'User email', hint: 'X-User-Email'},
  {key: 'userWallet', label: 'User wallet', hint: 'X-User-Wallet (EOA)'},
  {key: 'cardId', label: 'Card ID', hint: 'the card Reveal / Collect act on'},
  {key: 'cardholderName', label: 'Cardholder name'},
  {key: 'walletAmount', label: 'Wallet amount', hint: 'top-up quote the Checkout arms with'},
  {key: 'walletCurrency', label: 'Wallet currency'},
  {key: 'walletProvider', label: 'Wallet provider', hint: "estimate's provider name"},
  {key: 'estimationId', label: 'Estimation ID', hint: 'Wallet — from Fetch estimate, the kit or a seed link'},
  {key: 'threeDsUrl', label: '3DS url', hint: '3DS — three_ds_state.url; the 3DS tab starts with it'},
  {key: 'baasApiUrl', label: 'BaaS API URL', hint: 'for "Fetch estimate" — pricing is your backend\'s job'},
];

const SECRET_FIELDS: {key: 'bearer' | 'actionToken' | 'checkoutToken'; label: string; hint: string}[] = [
  {key: 'bearer', label: 'Bearer token', hint: 'getAccessToken — Wirex bearer for the user'},
  {key: 'actionToken', label: 'Step-up action token', hint: 'getActionToken — card data / PIN'},
  {key: 'checkoutToken', label: 'Checkout token', hint: 'token mode — minted by your backend'},
];

export default function ConfigScreen(): React.JSX.Element {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onConfigChange(force), []);
  const settings = getSettings();
  // The same `wirexqa://seed?d=…` link the app opens as a deep link, pasted instead — for a device
  // where opening the link is awkward (a chat that strips the scheme, a locked-down browser).
  const [seed, setSeed] = useState('');
  const [seedStatus, setSeedStatus] = useState<{text: string; ok: boolean} | null>(null);
  const applySeed = (): void => {
    diag('tap', 'Apply seed link');
    const result = applySeedLink(seed, 'paste');
    if ('rejected' in result) {
      setSeedStatus({text: `Not a wirexqa://seed link — ${result.rejected}`, ok: false});
    } else {
      setSeedStatus({text: `Applied ${result.applied} value${result.applied === 1 ? '' : 's'}`, ok: true});
      setSeed('');
    }
  };

  // The diagnostic log, live: re-render on every line and keep the box scrolled to the newest one.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onDiagChange(bump), []);
  const logBox = useRef<ScrollView | null>(null);
  const lines = diagLines();
  const [sharing, setSharing] = useState(false);
  const share = async (): Promise<void> => {
    diag('tap', 'Share log');
    setSharing(true);
    try {
      await shareDiag();
    } finally {
      setSharing(false);
    }
  };

  // The inset grows with the keyboard, so the bottom of the page scrolls into view; a drag takes the keyboard down.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Configuration</Text>
      <Text style={styles.caption}>Type a partner's parameters here; every screen reads them live. Secrets stay in memory only.</Text>

      <Text style={styles.section}>Seed link</Text>
      <View style={styles.group}>
        <TextInput
          style={styles.input}
          value={seed}
          onChangeText={setSeed}
          onSubmitEditing={applySeed}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          placeholder="wirexqa://seed?d=…"
          placeholderTextColor={T.textFaint}
        />
        <View style={styles.row}>
          <TouchableOpacity style={styles.apply} onPress={applySeed} activeOpacity={0.85}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, seedStatus ? {color: seedStatus.ok ? T.green : T.pink} : null]}>
          {seedStatus ? seedStatus.text : 'Paste the link the QA kit prints (the same one the app opens as a deep link); Apply fills every field below.'}
        </Text>
      </View>

      <Text style={styles.section}>Environment</Text>
      <View style={styles.row}>
        {(['test', 'production'] as ExampleEnvironment[]).map((env) => {
          const on = settings.environment === env;
          return (
            <TouchableOpacity key={env} style={[styles.chip, on && styles.chipOn]} onPress={() => { diag('tap', `environment chip ${env}`); setSetting('environment', env); }} activeOpacity={0.85}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{env}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.section}>Integration parameters</Text>
      <View style={styles.group}>
        {SETTING_FIELDS.map(({key, label, hint}) => (
          <Field key={key} label={label} hint={hint} value={String(settings[key])} onChange={(text) => setSetting(key, text)} />
        ))}
      </View>

      <Text style={styles.section}>Secrets · memory only</Text>
      <View style={styles.group}>
        {SECRET_FIELDS.map(({key, label, hint}) => (
          <Field key={key} label={label} hint={hint} value={getSecret(key)} onChange={(text) => setSecret(key, text)} secure />
        ))}
      </View>

      <Text style={styles.section}>Dev options</Text>
      <View style={styles.group}>
        <View style={styles.toggleRow}>
          <View style={{flex: 1}}>
            <Text style={styles.label}>Disable screen protection</Text>
            <Text style={styles.hint}>
              DEV ONLY: draw revealed PAN/CVV on the iOS Simulator (the secure layer renders blank there)
              and keep the 3DS challenge visible while the screen is recorded (device clouds). Leave OFF
              on a real device / any shippable build.
            </Text>
          </View>
          <Switch
            value={settings.devDisableScreenProtection}
            onValueChange={(v) => { diag('tap', `Disable screen protection → ${v ? 'on' : 'off'}`); setSetting('devDisableScreenProtection', v); }}
            trackColor={{true: T.accent, false: T.border}}
            thumbColor={T.text}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.reset} onPress={() => { diag('tap', 'Reset all'); resetConfig(); }} activeOpacity={0.85}>
        <Text style={styles.resetText}>Reset all</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Diagnostic log</Text>
      <View style={styles.group}>
        <Text style={styles.hint}>
          Everything the example and the SDK reported this run: taps, deep links, config changes, keyboard,
          SDK events. No secrets, no card data. Share it with a bug report.
        </Text>
        <ScrollView
          ref={logBox}
          style={styles.logBox}
          nestedScrollEnabled
          onContentSizeChange={() => logBox.current?.scrollToEnd({animated: false})}>
          <Text style={styles.logText} selectable>
            {lines.length ? lines.join('\n') : '(empty)'}
          </Text>
        </ScrollView>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.apply, sharing && styles.disabled]} onPress={() => void share()} disabled={sharing} activeOpacity={0.85}>
            <Text style={styles.applyText}>{sharing ? 'Collecting…' : 'Share log'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => { diag('tap', 'Clear log'); clearDiag(); }} activeOpacity={0.85}>
            <Text style={styles.secondaryText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>{lines.length} line{lines.length === 1 ? '' : 's'} · the share sheet gets this log plus the SDK's own native log lines.</Text>
      </View>
    </ScrollView>
  );
}

function Field({label, hint, value, onChange, secure}: {label: string; hint?: string; value: string; onChange: (text: string) => void; secure?: boolean}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        placeholder={secure ? 'paste…' : ''}
        placeholderTextColor={T.textFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  content: {padding: 16, paddingBottom: 48},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  caption: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  section: {fontSize: 12, fontWeight: '800', color: T.textFaint, marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8},
  row: {flexDirection: 'row', gap: 10},
  chip: {paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface},
  chipOn: {backgroundColor: T.accent, borderColor: T.accent},
  chipText: {color: T.textDim, fontWeight: '700'},
  chipTextOn: {color: T.onAccent},
  group: {backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: 14, gap: 12},
  toggleRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  field: {},
  label: {fontSize: 14, fontWeight: '700', color: T.text},
  hint: {fontSize: 12, color: T.textFaint, marginTop: 1},
  input: {marginTop: 6, borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: T.text, backgroundColor: T.surfaceAlt},
  apply: {paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: T.accent},
  applyText: {color: T.onAccent, fontWeight: '800'},
  reset: {marginTop: 26, alignSelf: 'flex-start', paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: '#FF407F22', borderWidth: 1, borderColor: T.pink},
  resetText: {color: T.pink, fontWeight: '800'},
  logBox: {height: 220, borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, backgroundColor: T.bg, padding: 8},
  logText: {fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10.5, lineHeight: 14, color: T.textDim},
  secondary: {paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border},
  secondaryText: {color: T.text, fontWeight: '800'},
  disabled: {opacity: 0.5},
});
