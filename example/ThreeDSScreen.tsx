/**
 * 3DS step-up — presents the issuer's authentication page a card top-up asks for and reports the
 * outcome. The SDK makes no backend call and takes no credentials: the host authenticates to obtain the
 * orchestrator URL (it comes back in the top-up response) and hands it over.
 *
 * Paste an orchestrator URL below (from a real top-up on your backend) and press Start.
 */
import React, {useCallback, useRef, useState} from 'react';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {WirexThreeDS, WirexThreeDSView, type WirexThreeDSSession} from '@wirexapp/mobile-sdk';

import {isTestMode} from './exampleConfig';
import {radius, T} from './theme';

export default function ThreeDSScreen(): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [session, setSession] = useState<WirexThreeDSSession | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const start = useCallback(async () => {
    if (busy.current || !url.trim()) return;
    busy.current = true;
    setOutcome(null);
    setError(null);
    try {
      await WirexThreeDS.configure({testMode: isTestMode(), logging: 'info'});
      const active = await WirexThreeDS.createSession(url.trim());
      setSession(active);
      await active.start();
      const result = await active.settled();
      setOutcome(JSON.stringify(result));
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, [url]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>3DS step-up</Text>
        <Text style={styles.sub}>Paste a top-up orchestrator URL — the SDK hosts the issuer challenge and reports the outcome. No credentials.</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="orchestrator URL from the top-up response"
          placeholderTextColor={T.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={[styles.btn, !url.trim() && styles.btnDisabled]} onPress={() => void start()} disabled={!url.trim()} activeOpacity={0.85}>
          <Text style={styles.btnText}>Start challenge</Text>
        </TouchableOpacity>
        {outcome ? <Text style={styles.outcome}>outcome: {outcome}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      {/* Keep it mounted at full size for the session's whole life; it passes touches through until a
          challenge needs them. */}
      <View style={styles.challenge}>{session ? <WirexThreeDSView session={session} style={StyleSheet.absoluteFill} /> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: T.bg},
  header: {padding: 16},
  title: {fontSize: 24, fontWeight: '800', color: T.text},
  sub: {fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18},
  input: {marginTop: 14, borderWidth: 1, borderColor: T.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, color: T.text, backgroundColor: T.surfaceAlt},
  btn: {marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.md, backgroundColor: T.accent},
  btnDisabled: {opacity: 0.4},
  btnText: {color: T.onAccent, fontWeight: '800', fontSize: 14},
  outcome: {marginTop: 12, color: T.green, fontWeight: '600'},
  error: {marginTop: 12, color: T.pink, fontWeight: '600'},
  challenge: {flex: 1, marginTop: 4, backgroundColor: T.surface},
});
