/**
 * Card reveal — shows a cardholder their own PAN / expiry / CVV / PIN in sealed native rows, and lets
 * you SEE the SDK's behaviour: per-field show/hide (the value masks and unmasks live), the SDK-drawn
 * copy button, and the load/declined/failed states.
 *
 * Needs on the Config tab: environment, chainId, bearer, step-up action token, cardId.
 */
import React, {useCallback, useEffect, useReducer, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  WirexReveal,
  WirexRevealFieldView,
  type WirexRevealField,
  type WirexRevealSession,
  type WirexRevealSnapshot,
  type WirexRevealStrings,
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

// PIN is omitted: a virtual card has none (the service answers "GetPin is not supported for retail"),
// and a segmented empty grid reads as broken. A plastic-card integration adds 'pin' back.
const FIELDS: WirexRevealField[] = ['cardholderName', 'pan', 'expiry', 'cvv'];

// The row headers this screen draws itself (uppercase).
const LABELS: Record<WirexRevealField, string> = {
  cardholderName: 'Cardholder',
  pan: 'Card number',
  expiry: 'Expiry',
  cvv: 'CVV',
  pin: 'PIN',
};

/**
 * The SDK ships no copy of its own; a host supplies every word it draws. We blank `fieldLabels` so
 * the SDK row draws NO label of its own — this screen already draws the header above each row, and a
 * second SDK-drawn label both duplicated it and made every row taller than it needed to be.
 */
const STRINGS: WirexRevealStrings = {
  fieldLabels: {cardholderName: '', pan: '', expiry: '', cvv: '', pin: ''},
  maskedPlaceholder: '•••• •••• •••• ••••',
  copy: 'Copy',
  copied: 'Copied',
  accessibilityShown: 'shown',
  accessibilityHidden: 'hidden',
  loadError: 'Unable to load card details',
};

export default function RevealScreen(): React.JSX.Element {
  const [session, setSession] = useState<WirexRevealSession | null>(null);
  const [snapshot, setSnapshot] = useState<WirexRevealSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [masked, setMasked] = useState<Record<string, boolean>>(() => Object.fromEntries(FIELDS.map((f) => [f, true])));
  // The native row measures its own content height and reports it via onNaturalHeight. RN cannot
  // size a native view for us, so without this each row stays at the minHeight and the value area's
  // exact-height constraint collapses to 0 (the value is drawn but invisible). Apply the reported
  // height per field.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  // Appearance lives on its own channel: re-render to pick up the new tokens WITHOUT rebuilding the
  // session (that would re-mint the step-up token and re-mask every row for a pure style change).
  const [, restyle] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAppearanceChange(restyle), []);

  const rebuild = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const {chainId, cardId, cardholderName, devDisableScreenProtection} = getSettings();
      diag('sdk', `reveal: configure testMode=${isTestMode()} chainId=${chainId || '(empty)'} cardId=${cardId ? `${cardId.length} chars` : '(empty)'} screenProtectionDisabled=${devDisableScreenProtection}`);
      await WirexReveal.configure({
        testMode: isTestMode(),
        chainId,
        credentials: exampleCredentialProvider,
        logging: 'info',
        // DEV/TEST ONLY: the revealed value is drawn in a secure UITextField layer that the iOS
        // SIMULATOR renders blank. Turning this on (Config tab) draws it normally so it is visible on
        // the simulator / in device clouds. Off by default — NEVER ship it on to cardholders.
        dangerouslyDisableScreenProtection: devDisableScreenProtection,
      });
      const active = await WirexReveal.createSession({cardId, cardholderName, fields: FIELDS});
      diag('sdk', `reveal: session created fields=${FIELDS.join(',')}`);
      active.onSnapshot((snap) => {
        setSnapshot(snap);
        const fields = snap.fields.map((f) => `${f.field}=${f.outcome}${f.error ? `(${f.error.code ?? 'error'})` : ''}`).join(' ');
        diag('sdk', `reveal: state=${snap.state} ${fields}`, `reveal-${snap.state}`);
      });
      setSnapshot(active.snapshot);
      setSession((prev) => {
        void prev?.destroy();
        return active;
      });
    } catch (e) {
      diag('err', `reveal: rebuild failed: ${describeError(e)}`);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void rebuild();
    return onConfigChange(() => void rebuild());
  }, [rebuild]);

  const setAll = (value: boolean) => setMasked(Object.fromEntries(FIELDS.map((f) => [f, value])));
  const allHidden = FIELDS.every((f) => masked[f]);

  // The inset grows with the keyboard, so the bottom of the page scrolls into view; a drag takes the keyboard down.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <View style={styles.headRow}>
        <Text style={styles.title}>Reveal</Text>
        <View style={[styles.statePill, stateStyle(snapshot?.state)]}>
          <Text style={styles.statePillText}>{snapshot?.state ?? 'idle'}</Text>
        </View>
      </View>
      <Text style={styles.sub}>Sealed native rows — the value never crosses the JS bridge. Tap to hide/show; Copy is drawn by the SDK.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {session ? (
        <View style={styles.card}>
          {FIELDS.map((field, i) => (
            <View key={field} style={[styles.row, i < FIELDS.length - 1 && styles.rowDivider]}>
              <View style={styles.fieldCol}>
                <Text style={styles.fieldLabel}>{LABELS[field]}</Text>
                <WirexRevealFieldView
                  session={session}
                  field={field}
                  strings={STRINGS}
                  appearance={getAppearance()}
                  themeMode={getThemeMode()}
                  masked={masked[field]}
                  onMaskedChange={(state) => {
                    diag('sdk', `reveal: ${field} ${state.masked ? 'masked' : 'revealed'}`);
                    setMasked((cur) => (cur[field] === state.masked ? cur : {...cur, [field]: state.masked}));
                  }}
                  onNaturalHeight={(h: number) => setHeights((cur) => (cur[field] === h ? cur : {...cur, [field]: h}))}
                  onCopyResult={() => {
                    diag('sdk', `reveal: copied ${field}`);
                    setNote(`Copied ${LABELS[field]}`);
                  }}
                  style={[styles.fieldView, heights[field] ? {height: heights[field]} : null]}
                />
              </View>
              <TouchableOpacity
                style={styles.eye}
                onPress={() => {
                  diag('tap', `${masked[field] ? 'Show' : 'Hide'} ${field}`);
                  setMasked((cur) => ({...cur, [field]: !cur[field]}));
                }}
                activeOpacity={0.7}>
                <Text style={styles.eyeText}>{masked[field] ? 'Show' : 'Hide'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={styles.actions}>
        <Btn
          label={busy ? 'Working…' : 'Load details'}
          onPress={() => {
            diag('tap', `Load details (session ${session ? 'present' : 'MISSING'})`);
            session?.load().catch((e) => diag('err', `reveal: load failed: ${describeError(e)}`));
          }}
          disabled={busy || !session}
          primary
        />
        <Btn label={allHidden ? 'Reveal all' : 'Hide all'} onPress={() => { diag('tap', allHidden ? 'Reveal all' : 'Hide all'); setAll(!allHidden); }} disabled={!session} />
        <Btn label="Rebuild" onPress={() => { diag('tap', 'Rebuild'); void rebuild(); }} />
      </View>
    </ScrollView>
  );
}

function Btn({label, onPress, primary, disabled}: {label: string; onPress: () => void; primary?: boolean; disabled?: boolean}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

function stateStyle(state?: string) {
  if (state === 'ready') return {backgroundColor: '#3CC65E22', borderColor: T.green};
  if (state === 'loading') return {backgroundColor: '#5753EA22', borderColor: T.accent};
  if (state === 'error') return {backgroundColor: '#FF407F22', borderColor: T.pink};
  return {backgroundColor: T.surfaceAlt, borderColor: T.border};
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  content: {padding: 16, paddingBottom: 40},
  headRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  sub: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  statePill: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1},
  statePillText: {color: T.text, fontSize: 12, fontWeight: '700'},
  error: {color: T.pink, marginTop: 10, fontWeight: '600'},
  card: {marginTop: 16, backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, paddingHorizontal: 16},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12},
  rowDivider: {borderBottomWidth: 1, borderBottomColor: T.border},
  fieldCol: {flex: 1},
  fieldLabel: {fontSize: 11, color: T.textFaint, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2},
  // Deliberately small: the row sizes itself to the height the SDK reports via onNaturalHeight
  // (applied above). This is the pattern a partner should follow — measure, don't guess. If a host
  // ignored onNaturalHeight and pinned a box this small, the SDK now CLIPS the value instead of
  // collapsing it to nothing.
  fieldView: {minHeight: 24},
  eye: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border},
  eyeText: {color: T.teal, fontSize: 13, fontWeight: '700'},
  note: {marginTop: 12, color: T.green, fontWeight: '600'},
  actions: {marginTop: 20, flexDirection: 'row', gap: 10, flexWrap: 'wrap'},
  btn: {paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border},
  btnPrimary: {backgroundColor: T.accent, borderColor: T.accent},
  btnDisabled: {opacity: 0.4},
  btnText: {color: T.text, fontWeight: '700', fontSize: 14},
  btnTextPrimary: {color: T.onAccent},
});
