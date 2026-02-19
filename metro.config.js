const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Metro error on Windows: expo-navigation-bar points to src/index.ts in package.json
// We force it to resolve to the build/index.js instead
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-navigation-bar') {
    return context.resolveRequest(context, 'expo-navigation-bar/build/index', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
