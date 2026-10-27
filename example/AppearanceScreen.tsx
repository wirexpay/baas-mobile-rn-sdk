/**
 * Appearance — one place to restyle every field on BOTH surfaces at once.
 *
 * The token map entered here is handed to the Reveal rows and the Collect form as their `appearance`
 * prop; `themeMode` tells the SDK which mode that map IS. The SDK resolves no theme — it draws the one
 * document it is given, so a host that follows the device supplies a different document when its own
 * screen flips. Both field screens listen on `onAppearanceChange`, so a preset or a pasted document
 * lands on both at once WITHOUT tearing down a live reveal session or clearing a half-typed form.
 *
 * Presets are hardcoded on purpose: the fastest way to see the token vocabulary do something visible,
 * each chosen to exercise a group of tokens rather than to look nice. The same six every platform's
 * example carries, token for token — each with a complete light and dark variant, because nothing
 * merges them and an omitted token falls through to the mode's default.
 */
import React, {useEffect, useReducer, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import type {WirexThemeMode} from '@wirexapp/mobile-sdk';

import {diag} from './diagLog';
import {
  type AppearanceTokens,
  getAppearance,
  getThemeMode,
  mergeAppearance,
  onAppearanceChange,
  resetAppearance,
  setAppearance,
  setThemeMode,
} from './exampleConfig';
import {radius, T} from './theme';

interface Preset {
  name: string;
  /** What it is here to demonstrate. Shown under the button, so the tab teaches the vocabulary. */
  exercises: string;
  light: AppearanceTokens;
  dark: AppearanceTokens;
}

const PRESETS: Preset[] = [
  {
    name: 'SDK defaults',
    exercises: 'every token unset — the mode’s own defaults',
    light: {},
    dark: {},
  },
  {
    name: 'Boxed',
    exercises: 'colorBackground, borderWidth, borderRadius, paddingValue*',
    light: {
      surfaceColor: '#FFFFFF',
      colorBackground: '#F1F5F9',
      colorBorder: '#CBD5E1',
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      paddingValueHorizontal: 12,
      paddingValueVertical: 10,
      colorText: '#0F172A',
      colorLabel: '#64748B',
    },
    dark: {
      surfaceColor: '#0B1120',
      colorBackground: '#1E293B',
      colorBorder: '#334155',
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      paddingValueHorizontal: 12,
      paddingValueVertical: 10,
      colorText: '#F8FAFC',
      colorLabel: '#94A3B8',
    },
  },
  {
    name: 'Right-aligned',
    exercises: 'textAlignBase, textAlignLabel',
    light: {
      textAlignBase: 'right',
      textAlignLabel: 'right',
      colorBackground: '#F8FAFC',
      paddingValueHorizontal: 12,
      borderRadius: 12,
    },
    dark: {
      textAlignBase: 'right',
      textAlignLabel: 'right',
      colorBackground: '#111827',
      paddingValueHorizontal: 12,
      borderRadius: 12,
    },
  },
  {
    name: 'Large type',
    exercises: 'fontSizeBase, lineHeightBase, controlMinHeight, iconSize',
    light: {
      fontSizeBase: 24,
      lineHeightBase: 34,
      fontSizeLabel: 15,
      lineHeightLabel: 20,
      controlMinHeight: 56,
      iconSize: 24,
      spacingLabel: 8,
      spacingUnit: 20,
    },
    dark: {
      fontSizeBase: 24,
      lineHeightBase: 34,
      fontSizeLabel: 15,
      lineHeightLabel: 20,
      controlMinHeight: 56,
      iconSize: 24,
      spacingLabel: 8,
      spacingUnit: 20,
    },
  },
  {
    name: 'Compact',
    exercises: 'the same tokens the other way — a dense list',
    light: {
      fontSizeBase: 15,
      lineHeightBase: 20,
      fontSizeLabel: 11,
      lineHeightLabel: 14,
      controlMinHeight: 36,
      iconSize: 12,
      spacingLabel: 2,
      spacingUnit: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    dark: {
      fontSizeBase: 15,
      lineHeightBase: 20,
      fontSizeLabel: 11,
      lineHeightLabel: 14,
      controlMinHeight: 36,
      iconSize: 12,
      spacingLabel: 2,
      spacingUnit: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
  },
  {
    name: 'High contrast',
    exercises: 'colorFocus and colorError — the caret and the error text',
    light: {
      surfaceColor: '#000000',
      colorBackground: '#000000',
      colorText: '#FFFFFF',
      colorLabel: '#FFD400',
      colorPlaceholder: '#7A7A7A',
      colorFocus: '#FFD400',
      colorError: '#FF453A',
      colorBorder: '#FFD400',
      borderWidth: 2,
      borderRadius: 4,
    },
    dark: {
      surfaceColor: '#000000',
      colorBackground: '#000000',
      colorText: '#FFFFFF',
      colorLabel: '#FFD400',
      colorPlaceholder: '#7A7A7A',
      colorFocus: '#FFD400',
      colorError: '#FF453A',
      colorBorder: '#FFD400',
      borderWidth: 2,
      borderRadius: 4,
    },
  },
];

const THEME_MODES: WirexThemeMode[] = ['light', 'dark'];
const pretty = (tokens: AppearanceTokens): string => JSON.stringify(tokens, null, 2);

export default function AppearanceScreen(): React.JSX.Element {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAppearanceChange(force), []);

  // The preset whose document is currently applied, so a theme change can re-send the matching
  // variant. Null once the document is edited by hand — a theme change must not overwrite that.
  const [activePreset, setActivePreset] = useState<string | null>('SDK defaults');
  const [draft, setDraft] = useState<string>(() => pretty(getAppearance()));
  const [status, setStatus] = useState<string | null>(null);

  const mode = getThemeMode();

  const applyPreset = (preset: Preset) => {
    diag('tap', `preset "${preset.name}" (${mode})`);
    const tokens = mode === 'dark' ? preset.dark : preset.light;
    setActivePreset(preset.name);
    setAppearance(tokens);
    setDraft(pretty(tokens));
    setStatus(`Applied preset "${preset.name}" (${mode})`);
  };

  const pickMode = (next: WirexThemeMode) => {
    diag('tap', `mode chip ${next}`);
    setThemeMode(next);
    // Re-send the active preset's variant for the new mode; a hand-edited document is left untouched.
    const preset = PRESETS.find((p) => p.name === activePreset);
    if (preset) {
      const tokens = next === 'dark' ? preset.dark : preset.light;
      setAppearance(tokens);
      setDraft(pretty(tokens));
    }
  };

  const applyDraft = () => {
    diag('tap', `Apply document (${draft.length} chars)`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      diag('err', `appearance: document is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      setStatus('Not valid JSON');
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setStatus('Expected a JSON object of tokens');
      return;
    }
    setActivePreset(null);
    mergeAppearance(parsed as AppearanceTokens);
    setStatus(`Merged ${Object.keys(parsed as object).length} token(s)`);
  };

  const reset = () => {
    diag('tap', 'Reset appearance');
    setActivePreset('SDK defaults');
    resetAppearance();
    setDraft(pretty({}));
    setStatus('Reset to SDK defaults');
  };

  // The inset grows with the keyboard, so the bottom of the page scrolls into view; a drag takes the keyboard down.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Appearance</Text>
      <Text style={styles.caption}>
        One document, and the SDK draws exactly it — there is no theme for it to resolve. Pick the mode
        your document IS below; a preset or a pasted map restyles the Reveal rows and the Collect form
        at once.
      </Text>

      <Text style={styles.section}>Mode · which the document IS</Text>
      <View style={styles.row}>
        {THEME_MODES.map((m) => {
          const on = mode === m;
          return (
            <TouchableOpacity key={m} style={[styles.chip, on && styles.chipOn]} onPress={() => pickMode(m)} activeOpacity={0.85}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.section}>Presets</Text>
      <View style={styles.group}>
        {PRESETS.map((preset) => {
          const on = activePreset === preset.name;
          return (
            <TouchableOpacity
              key={preset.name}
              style={[styles.preset, on && styles.presetOn]}
              onPress={() => applyPreset(preset)}
              activeOpacity={0.85}>
              <Text style={[styles.presetName, on && styles.presetNameOn]}>{preset.name}</Text>
              <Text style={styles.presetHint}>{preset.exercises}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.section}>Custom document · merged on apply</Text>
      <Text style={styles.hint}>
        A JSON object of appearance tokens, named as the SDK’s appearance contract names them
        (colorText, borderRadius, fontSizeBase, …). Anything omitted falls through to the mode’s default.
      </Text>
      <TextInput
        style={styles.editor}
        value={draft}
        onChangeText={setDraft}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder={'{\n  "colorFocus": "#5753EA"\n}'}
        placeholderTextColor={T.textFaint}
      />

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.actions}>
        <Btn label="Apply document" onPress={applyDraft} primary />
        <Btn label="Reset" onPress={reset} />
      </View>
    </ScrollView>
  );
}

function Btn({label, onPress, primary}: {label: string; onPress: () => void; primary?: boolean}): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.btn, primary && styles.btnPrimary]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
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
  chipText: {color: T.textDim, fontWeight: '700', textTransform: 'capitalize'},
  chipTextOn: {color: T.onAccent},
  group: {backgroundColor: T.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: 10, gap: 8},
  preset: {paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt},
  presetOn: {borderColor: T.accent, backgroundColor: '#5753EA22'},
  presetName: {fontSize: 15, fontWeight: '800', color: T.text},
  presetNameOn: {color: T.text},
  presetHint: {fontSize: 12, color: T.textFaint, marginTop: 2},
  hint: {fontSize: 12, color: T.textFaint, marginBottom: 8, lineHeight: 16},
  editor: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 13,
    color: T.text,
    backgroundColor: T.surface,
    fontFamily: 'Courier',
    textAlignVertical: 'top',
  },
  status: {marginTop: 12, color: T.teal, fontWeight: '600'},
  actions: {marginTop: 16, flexDirection: 'row', gap: 10},
  btn: {paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border},
  btnPrimary: {backgroundColor: T.accent, borderColor: T.accent},
  btnText: {color: T.text, fontWeight: '700', fontSize: 14},
  btnTextPrimary: {color: T.onAccent},
});
