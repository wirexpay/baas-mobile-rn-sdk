// SECURITY: debug builds only. metro.config.js gives a release or CI bundle an empty module here,
// and `__DEV__` drops the require from a release bundle, so the key in the file never ships.
export const loadE2eLocal = (): Record<string, unknown> => {
  if (!__DEV__) return {};
  const value: unknown = require('./e2e.local.json');
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};
