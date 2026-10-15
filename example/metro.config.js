const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration.
 *
 * `@wirexapp/mobile-sdk` is consumed as a published package from `node_modules`, so the default Metro
 * config is all this app needs — no `watchFolders`, no `blockList`. This is the configuration a partner
 * integrating the SDK ships.
 */
module.exports = mergeConfig(getDefaultConfig(__dirname), {});
