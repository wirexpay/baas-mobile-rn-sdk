/**
 * The example's diagnostic log — one in-memory ring buffer the whole app writes to, shown at the
 * bottom of the Config tab and shared from there with a bug report.
 *
 * What goes in: taps, deep links, config changes (key + length), keyboard, the events each screen
 * receives from the SDK, caught errors. What never goes in: a value from the Config tab (bearer, action
 * token, checkout token), a 3DS url's query, card data. `redact` is the backstop for a line that
 * slipped: it blanks JWT-shaped tokens, card-number-length digit runs and full wallet addresses.
 *
 * The native SDK's own lines (it is handed `logging: 'info'`) go to logcat / os_log, which JS cannot
 * read; "Share log" fetches them through `ExampleDiagnostics` and appends them.
 */
import {Dimensions, NativeModules, Platform, Share} from 'react-native';

export type DiagTag = 'app' | 'link' | 'config' | 'tap' | 'kbd' | 'sdk' | 'err';

interface Entry {
  line: string;
  /** Consecutive entries with the same key replace one another (a keystroke-by-keystroke edit is one line). */
  coalesceKey?: string;
}

const MAX_LINES = 2000;
const entries: Entry[] = [];
const listeners = new Set<() => void>();

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
const stamp = (): string => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

// SECURITY: the log leaves the device through the share sheet. Secrets are never passed in — this
// blanks the shapes a secret would have if one were: a JWT, a PAN-length digit run, a wallet address.
export const redact = (text: string): string =>
  text
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*/g, '<jwt>')
    .replace(/\b\d{13,19}\b/g, '<digits>')
    .replace(/0x([0-9a-fA-F]{4})[0-9a-fA-F]{32}([0-9a-fA-F]{4})\b/g, '0x$1…$2');

/** The one write path. `coalesceKey` folds a burst of same-key lines into the latest one. */
export const diag = (tag: DiagTag, message: string, coalesceKey?: string): void => {
  const line = `${stamp()} [${tag}] ${redact(message)}`;
  const last = entries[entries.length - 1];
  if (coalesceKey && last?.coalesceKey === coalesceKey) {
    entries[entries.length - 1] = {line, coalesceKey};
  } else {
    entries.push({line, coalesceKey});
    if (entries.length > MAX_LINES) entries.splice(0, entries.length - MAX_LINES);
  }
  if (__DEV__) console.log(`[diag] ${line}`);
  listeners.forEach((fn) => fn());
};

/** A caught error, as one safe line: its name, code and message. */
export const describeError = (e: unknown): string => {
  if (e instanceof Error) {
    const code = (e as {code?: string}).code;
    return `${e.name}${code ? ` (${code})` : ''}: ${e.message}`;
  }
  return String(e);
};

/** A URL as the log shows it: scheme, host and the first path segment only — never its query. */
export const describeUrl = (url: string): string => {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i.exec(url.trim());
  if (!m) return `<not a url, ${url.length} chars>`;
  return `${m[1]}://${m[2]}${m[3].split('/').slice(0, 2).join('/')} (${url.length} chars)`;
};

export const diagLines = (): readonly string[] => entries.map((e) => e.line);
export const diagCount = (): number => entries.length;

export const onDiagChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const clearDiag = (): void => {
  entries.length = 0;
  listeners.forEach((fn) => fn());
};

// ── The native side: app/device facts and the SDK's own os_log / logcat lines ─────────────────────

interface AppInfo {
  appId: string;
  version: string;
  build: string;
  model: string;
  os: string;
}

interface ExampleDiagnosticsModule {
  appInfo(): Promise<AppInfo>;
  nativeLog(): Promise<string>;
}

const native = (NativeModules as {ExampleDiagnostics?: ExampleDiagnosticsModule}).ExampleDiagnostics;

const sdkVersion = (): string => {
  try {
    return (require('@wirexapp/mobile-sdk/package.json') as {version: string}).version;
  } catch {
    return 'unknown';
  }
};

const rnVersion = (): string => {
  const v = Platform.constants.reactNativeVersion;
  return `${v.major}.${v.minor}.${v.patch}${v.prerelease != null ? `-${v.prerelease}` : ''}`;
};

/** The facts every report starts with. Falls back to what JS alone can tell when the native module is absent. */
export const diagHeader = async (): Promise<string> => {
  const constants = Platform.constants as unknown as Record<string, unknown>;
  let info: AppInfo | null = null;
  try {
    info = (await native?.appInfo()) ?? null;
  } catch (e) {
    diag('err', `appInfo failed: ${describeError(e)}`);
  }
  const {width, height, scale, fontScale} = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  const os = info?.os ?? (Platform.OS === 'ios' ? `iOS ${String(constants.osVersion)}` : `Android ${String(constants.Release)} (API ${String(constants.Version)})`);
  const model = info?.model ?? (Platform.OS === 'ios' ? 'iPhone/iPad' : `${String(constants.Manufacturer)} ${String(constants.Model)}`);
  return [
    'Wirex Mobile SDK — React Native example diagnostic log',
    `app: ${info?.appId ?? 'unknown'} ${info?.version ?? ''} (${info?.build ?? ''})`,
    `platform: ${Platform.OS} · ${os} · ${model}${Platform.OS === 'ios' && constants.interfaceIdiom ? ` · ${String(constants.interfaceIdiom)}` : ''}`,
    `sdk: @wirexapp/mobile-sdk ${sdkVersion()} · react-native ${rnVersion()} · hermes=${String((globalThis as {HermesInternal?: unknown}).HermesInternal != null)}`,
    `window: ${Math.round(width)}×${Math.round(height)} @${scale}x fontScale=${fontScale} · screen ${Math.round(screen.width)}×${Math.round(screen.height)}`,
    `locale: ${Intl.DateTimeFormat().resolvedOptions().locale} · tz ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? '?'}`,
    `generated: ${new Date().toISOString()} · ${entries.length} lines`,
  ].join('\n');
};

/** The whole report: header, the app's lines, then the native log (the SDK's own os_log / logcat lines). */
export const diagReport = async (): Promise<string> => {
  const header = await diagHeader();
  let nativeLog = '';
  try {
    nativeLog = native ? await native.nativeLog() : 'ExampleDiagnostics native module not registered';
  } catch (e) {
    nativeLog = `native log unavailable: ${describeError(e)}`;
  }
  const nativeLines = nativeLog.split('\n').filter((l) => l.trim() !== '');
  return [
    header,
    '',
    '--- app log ---',
    ...diagLines(),
    '',
    `--- native log (${nativeLines.length} lines) ---`,
    ...nativeLines.map(redact),
    '',
  ].join('\n');
};

/** The system share sheet with the report as plain text (Mail, Slack, Notes, AirDrop…). */
export const shareDiag = async (): Promise<void> => {
  const text = await diagReport();
  try {
    const result = await Share.share(
      Platform.OS === 'ios' ? {message: text} : {message: text, title: 'Wirex SDK example log'},
      {subject: 'Wirex SDK example diagnostic log', dialogTitle: 'Share diagnostic log'},
    );
    diag('app', `share: ${result.action}${result.activityType ? ` via ${result.activityType}` : ''}`);
  } catch (e) {
    diag('err', `share failed: ${describeError(e)}`);
  }
};
