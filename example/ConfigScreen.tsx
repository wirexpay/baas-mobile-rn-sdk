/**
 * The Config (debug) tab: a form over `exampleConfig`, so QA types every integration parameter and
 * credential straight into the running build — no rebuild, no source edit. One binary, any partner's
 * data.
 *
 * Non-secret settings are plain fields. Secrets (bearer, step-up token, checkout token) are entered the
 * same way but held in memory only; a note says so. "Reset" clears everything back to defaults.
 */
import React, {useEffect, useReducer} from 'react';
import {ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {
  type ExampleEnvironment,
  type ExampleSettings,
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Configuration</Text>
      <Text style={styles.caption}>Type a partner's parameters here; every screen reads them live. Secrets stay in memory only.</Text>

      <Text style={styles.section}>Environment</Text>
      <View style={styles.row}>
        {(['test', 'production'] as ExampleEnvironment[]).map((env) => {
          const on = settings.environment === env;
          return (
            <TouchableOpacity key={env} style={[styles.chip, on && styles.chipOn]} onPress={() => setSetting('environment', env)} activeOpacity={0.85}>
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
              DEV ONLY: draw revealed PAN/CVV on the iOS Simulator (the secure layer renders blank there).
              Leave OFF on a real device / any shippable build.
            </Text>
          </View>
          <Switch
            value={settings.devDisableScreenProtection}
            onValueChange={(v) => setSetting('devDisableScreenProtection', v)}
            trackColor={{true: T.accent, false: T.border}}
            thumbColor={T.text}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.reset} onPress={resetConfig} activeOpacity={0.85}>
        <Text style={styles.resetText}>Reset all</Text>
      </TouchableOpacity>
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
  reset: {marginTop: 26, alignSelf: 'flex-start', paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: '#FF407F22', borderWidth: 1, borderColor: T.pink},
  resetText: {color: T.pink, fontWeight: '800'},
});
