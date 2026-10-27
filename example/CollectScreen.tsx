/**
 * Card collect — a sealed native form that tokenises a card the user types. The PAN never crosses the
 * JS bridge; this screen sees only validity, the brand and the tokenisation result.
 *
 * Needs on the Config tab: environment, chainId, bearer.
 */
import React, {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  WirexCollect,
  WirexCollectFormView,
  type WirexCollectFormHandle,
  type WirexCollectState,
  type WirexCollectProfile,
} from '@wirexapp/mobile-sdk';

import {describeError, diag} from './diagLog';
import {
  exampleCredentialProvider,
  getAppearance,
  getSettings,
  getThemeMode,
  isTestMode,
  onAppearanceChange,
  onConfigChange,
} from './exampleConfig';
import {radius, T} from './theme';

export default function CollectScreen(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WirexCollectState | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useRef<WirexCollectFormHandle | null>(null);
  // Appearance is on its own channel: re-render for the new tokens without reconfiguring the form
  // (a reconfigure would clear what the user has typed).
  const [, restyle] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAppearanceChange(restyle), []);

  const configure = useCallback(async () => {
    setError(null);
    const {chainId, devDisableScreenProtection} = getSettings();
    diag('sdk', `collect: configure testMode=${isTestMode()} chainId=${chainId || '(empty)'} screenProtectionDisabled=${devDisableScreenProtection}`);
    try {
      await WirexCollect.configure({
        testMode: isTestMode(),
        chainId,
        credentials: exampleCredentialProvider,
        logging: 'info',
        // DEV/TEST ONLY: secure input layer renders blank on the iOS simulator; turn this on (Config
        // tab) so the collect fields are visible there. Off by default — never ship it on.
        dangerouslyDisableScreenProtection: devDisableScreenProtection,
      });
      diag('sdk', 'collect: configured');
      setReady(true);
    } catch (e) {
      diag('err', `collect: configure failed: ${describeError(e)}`);
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void configure();
    return onConfigChange(() => void configure());
  }, [configure]);

  // Which form to draw: `topup` (number, expiry, CVV, name) or `oct-destination` (number + name, no CVV
  // / expiry — a card money is SENT to). The native and Flutter examples offer the same two.
  const [profile, setProfile] = useState<WirexCollectProfile>('topup');

  // The sealed fields are native, not RN TextInputs, so RN's own keyboard handling (tap-outside
  // dismissal, `Keyboard.dismiss()`) does not know about them: the form's `blur()` is what drops the
  // field's focus and takes the keyboard down. The number pad has no Done key, so the host offers one.
  const dismissKeyboard = useCallback(() => {
    diag('tap', `dismiss keyboard (form handle ${form.current ? 'present' : 'MISSING'})`);
    void form.current?.blur();
  }, []);

  // One line per form report, folded: the latest validity of every field, so the log shows what the
  // Tokenize button saw at the moment it was (or was not) pressable.
  const onFormChange = useCallback((next: WirexCollectState) => {
    setState(next);
    const fields = next.fields.map((f) => `${f.field}=${f.isValid ? 'ok' : f.isEmpty ? 'empty' : `invalid(${f.error ?? '?'})`}`).join(' ');
    diag('sdk', `collect: isComplete=${next.isComplete} brand=${next.brand} ${fields}`, 'collect-state');
  }, []);

  // The whole pipeline, step by step: the log must show whether the press reached JS at all, what the
  // form reported at that moment, and what the native tokenise call answered.
  const tokenize = useCallback(async () => {
    const handle = form.current;
    diag('tap', `Tokenize: profile=${profile} handle=${handle ? 'present' : 'MISSING'} isComplete=${state?.isComplete ?? 'n/a'} submitting=${submitting}`);
    if (!handle) return;
    await handle.blur();
    diag('sdk', 'collect: blur() done');
    setSubmitting(true);
    setResult('Tokenising…');
    try {
      if (profile === 'oct-destination') {
        diag('sdk', 'collect: tokenizeOctDestination…');
        const oct = await handle.tokenizeOctDestination({cardLabel: 'QA card', isSaved: false, isThirdParty: false});
        diag('sdk', `collect: tokenizeOctDestination ok brand=${oct.brand} last4=${oct.last4}`);
        setResult(`Linked (OCT) · ${oct.brand} •••• ${oct.last4}`);
        return;
      }
      diag('sdk', 'collect: tokenizeTopUp…');
      const token = await handle.tokenizeTopUp({
        billingDetails: {line1: '1 Example Street', zipCode: 'SW1A 1AA', city: 'London', country: 'GB'},
      });
      const tokenLength = Object.values(token).filter((v): v is string => typeof v === 'string').reduce((n, v) => Math.max(n, v.length), 0);
      diag('sdk', `collect: tokenizeTopUp ok brand=${token.brand} last4=${token.last4} exp=${token.expiryMonth}/${token.expiryYear} (longest field ${tokenLength} chars)`);
      setResult(`Linked · ${token.brand} •••• ${token.last4} · exp ${token.expiryMonth}/${token.expiryYear}`);
    } catch (e) {
      const code = (e as {code?: string}).code ?? String(e);
      diag('err', `collect: tokenize failed: ${describeError(e)}`);
      setResult(`Failed: ${code}`);
    } finally {
      setSubmitting(false);
    }
  }, [profile, state, submitting]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      // Taps on the buttons go through while the keyboard is up; a drag takes the keyboard down with
      // it; the content inset grows with the keyboard so Tokenize scrolls into view on a small screen.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets>
      {/* A tap on the text around the form drops the sealed field's focus. The form itself is NOT
          inside a Pressable: a JS responder over the native form would cancel its touches. */}
      <Pressable onPress={dismissKeyboard}>
      <View style={styles.headRow}>
        <Text style={styles.title}>Collect</Text>
        <View style={[styles.brandPill, state?.isComplete ? styles.brandOk : null]}>
          <Text style={styles.brandText}>{state?.brand ?? 'card'}</Text>
        </View>
      </View>
      <Text style={styles.sub}>A sealed native form. JS never sees a keystroke — only the validity below.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.profiles}>
        {(['topup', 'oct-destination'] as WirexCollectProfile[]).map((p) => (
          <TouchableOpacity key={p} style={[styles.profileChip, profile === p && styles.profileChipOn]} onPress={() => { diag('tap', `profile chip ${p}`); setProfile(p); setState(null); setResult(null); }} activeOpacity={0.85}>
            <Text style={[styles.profileChipText, profile === p && styles.profileChipTextOn]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      </Pressable>

      {ready ? (
        <View style={styles.card} key={profile}>
          <WirexCollectFormView
            profile={profile}
            appearance={getAppearance()}
            themeMode={getThemeMode()}
            onReady={(handle: WirexCollectFormHandle) => {
              diag('sdk', `collect: form ready (profile ${profile})`);
              form.current = handle;
            }}
            onChange={onFormChange}
            style={styles.form}
          />
        </View>
      ) : (
        <Text style={styles.note}>Configuring…</Text>
      )}

      <Pressable onPress={dismissKeyboard}>
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

      {/* `onTouchStart` fires for a touch anywhere in the row, a disabled button included — so a tap on a
          greyed-out Tokenize still leaves a line saying what the button's state was. */}
      <View
        style={styles.actions}
        onTouchStart={(e) => diag('tap', `touch in Collect actions row x=${Math.round(e.nativeEvent.locationX)} y=${Math.round(e.nativeEvent.locationY)} (Tokenize disabled=${!state?.isComplete || submitting}, ready=${ready})`)}>
        <Btn
          label={submitting ? 'Working…' : 'Tokenize'}
          onPressIn={() => diag('tap', 'Tokenize pressIn')}
          onPress={() => void tokenize()}
          disabled={!state?.isComplete || submitting}
          primary
        />
        <Btn label="Clear" onPress={() => { diag('tap', 'Clear'); void form.current?.clear(); }} disabled={!ready} />
        <Btn label="Done" onPress={dismissKeyboard} disabled={!ready} />
      </View>

      {result ? <Text style={styles.result}>{result}</Text> : null}
      </Pressable>
    </ScrollView>
  );
}

function chipStyle(f: {isValid: boolean; isEmpty: boolean}) {
  if (f.isValid) return {backgroundColor: '#3CC65E22', borderColor: T.green};
  if (f.isEmpty) return {backgroundColor: T.surfaceAlt, borderColor: T.border};
  return {backgroundColor: '#FF407F22', borderColor: T.pink};
}

function Btn({label, onPress, onPressIn, primary, disabled}: {label: string; onPress: () => void; onPressIn?: () => void; primary?: boolean; disabled?: boolean}): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]} onPress={onPress} onPressIn={onPressIn} disabled={disabled} activeOpacity={0.85}>
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
  profiles: {flexDirection: 'row', gap: 8, marginTop: 12},
  profileChip: {paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface},
  profileChipOn: {backgroundColor: T.accent, borderColor: T.accent},
  profileChipText: {color: T.textDim, fontWeight: '700', fontSize: 12},
  profileChipTextOn: {color: T.onAccent},
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
