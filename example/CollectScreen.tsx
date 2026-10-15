/**
 * Card collect — a sealed native form that tokenises a card the user types. The PAN never crosses the
 * JS bridge; this screen sees only validity, the brand and the tokenisation result.
 *
 * Needs on the Config tab: environment, chainId, bearer.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  WirexCollect,
  WirexCollectFormView,
  type WirexCollectFormHandle,
  type WirexCollectState,
} from '@wirexapp/mobile-sdk';

import {exampleCredentialProvider, getSettings, isTestMode, onConfigChange} from './exampleConfig';
import {radius, T} from './theme';

export default function CollectScreen(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WirexCollectState | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useRef<WirexCollectFormHandle | null>(null);

  const configure = useCallback(async () => {
    setError(null);
    try {
      await WirexCollect.configure({
        testMode: isTestMode(),
        chainId: getSettings().chainId,
        credentials: exampleCredentialProvider,
        logging: 'info',
        // DEV/TEST ONLY: secure input layer renders blank on the iOS simulator; turn this on (Config
        // tab) so the collect fields are visible there. Off by default — never ship it on.
        dangerouslyDisableScreenProtection: getSettings().devDisableScreenProtection,
      });
      setReady(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void configure();
    return onConfigChange(() => void configure());
  }, [configure]);

  const tokenize = useCallback(async () => {
    const handle = form.current;
    if (!handle) return;
    setSubmitting(true);
    setResult('Tokenising…');
    try {
      const token = await handle.tokenizeTopUp({
        billingDetails: {line1: '1 Example Street', zipCode: 'SW1A 1AA', city: 'London', country: 'GB'},
      });
      setResult(`Linked · ${token.brand} •••• ${token.last4} · exp ${token.expiryMonth}/${token.expiryYear}`);
    } catch (e) {
      const code = (e as {code?: string}).code ?? String(e);
      setResult(`Failed: ${code}`);
    } finally {
      setSubmitting(false);
    }
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <Text style={styles.title}>Collect</Text>
        <View style={[styles.brandPill, state?.isComplete ? styles.brandOk : null]}>
          <Text style={styles.brandText}>{state?.brand ?? 'card'}</Text>
        </View>
      </View>
      <Text style={styles.sub}>A sealed native form. JS never sees a keystroke — only the validity below.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {ready ? (
        <View style={styles.card}>
          <WirexCollectFormView
            profile="topup"
            themeMode="dark"
            onReady={(handle: WirexCollectFormHandle) => (form.current = handle)}
            onChange={setState}
            style={styles.form}
          />
        </View>
      ) : (
        <Text style={styles.note}>Configuring…</Text>
      )}

      {/* Per-field validity, so the sealed form's state is visible. */}
      {state?.fields?.length ? (
        <View style={styles.chips}>
          {state.fields.map((f) => (
            <View key={f.field} style={[styles.chip, chipStyle(f)]}>
              <Text style={styles.chipText}>
                {f.field}: {f.isValid ? 'ok' : f.isEmpty ? 'empty' : 'invalid'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Btn label={submitting ? 'Working…' : 'Tokenize'} onPress={() => void tokenize()} disabled={!state?.isComplete || submitting} primary />
        <Btn label="Clear" onPress={() => void form.current?.clear()} disabled={!ready} />
      </View>

      {result ? <Text style={styles.result}>{result}</Text> : null}
    </ScrollView>
  );
}

function chipStyle(f: {isValid: boolean; isEmpty: boolean}) {
  if (f.isValid) return {backgroundColor: '#3CC65E22', borderColor: T.green};
  if (f.isEmpty) return {backgroundColor: T.surfaceAlt, borderColor: T.border};
  return {backgroundColor: '#FF407F22', borderColor: T.pink};
}

function Btn({label, onPress, primary, disabled}: {label: string; onPress: () => void; primary?: boolean; disabled?: boolean}): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  content: {padding: 16, paddingBottom: 40},
  headRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  sub: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  error: {color: T.pink, marginTop: 10, fontWeight: '600'},
  brandPill: {paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt},
  brandOk: {borderColor: T.green, backgroundColor: '#3CC65E22'},
  brandText: {color: T.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize'},
  card: {marginTop: 16, backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: 14},
  form: {width: '100%'},
  note: {fontSize: 13, color: T.textDim, marginTop: 16},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14},
  chip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1},
  chipText: {color: T.text, fontSize: 12, fontWeight: '600'},
  actions: {marginTop: 18, flexDirection: 'row', gap: 10},
  btn: {paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border},
  btnPrimary: {backgroundColor: T.accent, borderColor: T.accent},
  btnDisabled: {opacity: 0.4},
  btnText: {color: T.text, fontWeight: '700', fontSize: 14},
  btnTextPrimary: {color: T.onAccent},
  result: {marginTop: 14, color: T.green, fontWeight: '600'},
});
