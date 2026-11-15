const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow importing GeoJSON outlines as modules (also mirrored as .json).
config.resolver.sourceExts = [...new Set([...(config.resolver.sourceExts || []), 'geojson', 'json'])];

module.exports = config;
