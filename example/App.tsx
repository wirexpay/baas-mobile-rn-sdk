/**
 * Wirex Mobile SDK — React Native example.
 *
 * One binary that exercises every surface (Reveal, Collect, 3DS step-up, Wallet top-up) against any
 * partner's data: type the parameters and credentials on the Config tab and each screen reads them live.
 * Nothing is hard-coded and nothing is persisted — see PARTNER-CONFIG.md.
 */
import React, {useEffect, useReducer, useState} from 'react';
import {AppState, Keyboard, Linking, StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import AppearanceScreen from './AppearanceScreen';
import CollectScreen from './CollectScreen';
import ConfigScreen from './ConfigScreen';
import {describeError, diag, diagHeader} from './diagLog';
import {applySeedLink, getSettings, onAppearanceChange, onConfigChange} from './exampleConfig';
import RevealScreen from './RevealScreen';
import {T} from './theme';
import ThreeDSScreen from './ThreeDSScreen';
import WalletScreen from './WalletScreen';

const TABS = ['Config', 'Reveal', 'Collect', '3DS', 'Wallet', 'Appearance'] as const;
type Tab = (typeof TABS)[number];

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('Config');
  const [, force] = useReducer((n: number) => n + 1, 0);
  // Re-render the whole tree on either channel: a config change so the panes re-read their inputs, an
  // appearance change so the Reveal / Collect field views re-read the token map they draw with.
  useEffect(() => {
    const offConfig = onConfigChange(force);
    const offAppearance = onAppearanceChange(force);
    return () => {
      offConfig();
      offAppearance();
    };
  }, []);

  // A `wirexqa://seed?d=<base64url(JSON)>` deep link prefills the Config, so a partner or QA can arm a
  // device without typing — any parameter, the bearer and action token included (see `applySeedLink`).
  // The Config tab has a field for the same link, for a device where opening it is awkward.
  useEffect(() => {
    Linking.getInitialURL().then(
      (url) => (url ? applySeedLink(url, 'url') : diag('link', 'initial url: none')),
      (e) => diag('err', `getInitialURL failed: ${describeError(e)}`),
    );
    const sub = Linking.addEventListener('url', (e) => applySeedLink(e.url, 'url'));
    return () => sub.remove();
  }, []);

  // The diagnostic log (Config tab, bottom): what this process is, then every foreground/background
  // change and every keyboard show/hide, so a report reads like the run it describes.
  useEffect(() => {
    diagHeader().then((header) => diag('app', `launch\n${header}`), (e) => diag('err', `header failed: ${describeError(e)}`));
    const state = AppState.addEventListener('change', (next) => diag('app', `state → ${next}`));
    const shown = Keyboard.addListener('keyboardDidShow', (e) => diag('kbd', `shown height=${Math.round(e.endCoordinates.height)}`));
    const hidden = Keyboard.addListener('keyboardDidHide', () => diag('kbd', 'hidden'));
    return () => {
      state.remove();
      shown.remove();
      hidden.remove();
    };
  }, []);
  const env = getSettings().environment;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoDot} />
            <Text style={styles.brand}>
              Wirex <Text style={styles.brandThin}>Mobile SDK</Text>
            </Text>
          </View>
          <View style={[styles.envBadge, env === 'production' ? styles.envProd : styles.envTest]}>
            <Text style={styles.envText}>{env}</Text>
          </View>
        </View>

        {/* Panes stay mounted so a session or a typed value survives a tab switch — except 3DS: its
            challenge view keeps the WINDOW capture-protected while attached, which would blank every
            other tab's screenshots after a step-up, so that pane unmounts (and destroys its session)
            when it is not the one shown. */}
        <View style={styles.body}>
          <Pane show={tab === 'Config'}><ConfigScreen /></Pane>
          <Pane show={tab === 'Reveal'}><RevealScreen /></Pane>
          <Pane show={tab === 'Collect'}><CollectScreen /></Pane>
          <Pane show={tab === '3DS'}>{tab === '3DS' ? <ThreeDSScreen /> : null}</Pane>
          <Pane show={tab === 'Wallet'}><WalletScreen /></Pane>
          <Pane show={tab === 'Appearance'}><AppearanceScreen /></Pane>
        </View>

        {/* The tab bar carries its OWN bottom safe-area inset, so the gesture pill or the 3-button
            navigation bar (edge-to-edge from Android 15 / targetSdk 35) sits below it rather than on
            top of it. The bar's own surface color fills the inset area. */}
        <SafeAreaView edges={['bottom']} style={styles.tabs}>
          {TABS.map((name) => {
            const on = tab === name;
            return (
              <TouchableOpacity key={name} style={styles.tab} onPress={() => { diag('tap', `tab ${name}`); setTab(name); }} activeOpacity={0.8}>
                <View style={[styles.tabPill, on && styles.tabPillOn]}>
                  <Text numberOfLines={1} style={[styles.tabText, on && styles.tabTextOn]}>{name}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Pane({show, children}: {show: boolean; children: React.ReactNode}): React.JSX.Element {
  return <View style={show ? styles.pane : styles.paneHidden}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  logoDot: {width: 26, height: 26, borderRadius: 8, backgroundColor: T.accent},
  brand: {color: T.text, fontSize: 20, fontWeight: '800', letterSpacing: 0.2},
  brandThin: {color: T.textDim, fontWeight: '600'},
  envBadge: {paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999},
  envTest: {backgroundColor: '#5753EA22', borderWidth: 1, borderColor: T.accent},
  envProd: {backgroundColor: '#3CC65E22', borderWidth: 1, borderColor: T.green},
  envText: {color: T.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5},
  body: {flex: 1},
  pane: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  paneHidden: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, zIndex: -1},
  tabs: {flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border},
  tab: {flex: 1, alignItems: 'center'},
  tabPill: {paddingVertical: 8, paddingHorizontal: 6, borderRadius: 999, width: '100%', alignItems: 'center'},
  tabPillOn: {backgroundColor: T.accent},
  tabText: {fontSize: 11.5, color: T.textDim, fontWeight: '600'},
  tabTextOn: {color: T.onAccent, fontWeight: '800'},
});
