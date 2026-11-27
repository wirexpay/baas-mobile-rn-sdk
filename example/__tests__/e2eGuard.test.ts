import {execFileSync} from 'child_process';
import fs from 'fs';
import path from 'path';

import {redact} from '../diagLog';

// Only the resolver is under test; Metro's own config does not load under the react-native preset.
jest.mock('@react-native/metro-config', () => ({
  getDefaultConfig: () => ({}),
  mergeConfig: (base: object, extra: object) => ({...base, ...extra}),
}));

const EXAMPLE = path.resolve(__dirname, '..');
const {resolveRequest} = require('../metro.config.js').resolver;

const resolveLocalFile = (dev: boolean) => {
  const fallback = jest.fn(() => ({type: 'sourceFile', filePath: 'other'}));
  const context = {dev, originModulePath: path.join(EXAMPLE, 'e2eLocal.ts'), resolveRequest: fallback};
  return resolveRequest(context, './e2e.local.json', 'android');
};

describe('e2e.local.json guard', () => {
  const env = {...process.env};
  afterEach(() => {
    process.env = {...env};
    jest.restoreAllMocks();
  });

  it('is gitignored, so it never reaches a commit', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', 'e2e.local.json'], {cwd: EXAMPLE})).not.toThrow();
  });

  it('reaches only a dev bundle outside CI', () => {
    delete process.env.CI;
    delete process.env.TEAMCITY_VERSION;
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(resolveLocalFile(true)).toEqual({type: 'sourceFile', filePath: path.join(EXAMPLE, 'e2e.local.json')});
    expect(resolveLocalFile(false)).toEqual({type: 'empty'});
  });

  it('is never read on CI', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    process.env.TEAMCITY_VERSION = '2025.1';
    expect(resolveLocalFile(true)).toEqual({type: 'empty'});
    delete process.env.TEAMCITY_VERSION;
    process.env.CI = 'true';
    expect(resolveLocalFile(true)).toEqual({type: 'empty'});
  });

  it('resolves to an empty module when the file is absent', () => {
    delete process.env.CI;
    delete process.env.TEAMCITY_VERSION;
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolveLocalFile(true)).toEqual({type: 'empty'});
  });

  it('keeps a key or a hash out of the diagnostic log', () => {
    expect(redact(`key 0x${'01'.repeat(32)} hash ${'ab'.repeat(32)}`)).toBe('key <hex> hash <hex>');
  });
});
