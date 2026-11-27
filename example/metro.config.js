const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration.
 *
 * `@wirexapp/mobile-sdk` is consumed as a published package from `node_modules`, so the default Metro
 * config is all a partner ships — no `watchFolders`, no `blockList`. Two additions: the example's own
 * `e2e.local.json`, the gitignored tester file that can carry a test user's key, and a local binding
 * linked by `npm run sdk:local`.
 */
const E2E_LOCAL = path.resolve(__dirname, 'e2e.local.json');

// SECURITY: the tester file reaches a dev bundle only, never a release bundle or a CI build.
// Every other bundle gets an empty module, so `require('./e2e.local.json')` answers `{}`.
const resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './e2e.local.json' && path.dirname(context.originModulePath) === __dirname) {
    const isCi = Boolean(process.env.CI || process.env.TEAMCITY_VERSION);
    if (!context.dev || isCi || !fs.existsSync(E2E_LOCAL)) return {type: 'empty'};
    return {type: 'sourceFile', filePath: E2E_LOCAL};
  }
  return context.resolveRequest(context, moduleName, platform);
};

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A binding linked from outside this folder is watched, and its own node_modules are hidden so the
// app and the binding share one React. A published install leaves this empty.
const linkedSdk = () => {
  const installed = path.resolve(__dirname, 'node_modules/@wirexapp/mobile-sdk');
  const real = fs.existsSync(installed) ? fs.realpathSync(installed) : installed;
  if (real === installed) return {watchFolders: [], resolver: {}};
  return {
    watchFolders: [real],
    resolver: {
      nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
      blockList: new RegExp(`^${escape(real)}/node_modules/.*$`),
    },
  };
};

const local = linkedSdk();
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: local.watchFolders,
  resolver: {...local.resolver, resolveRequest},
});
