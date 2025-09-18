const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure metro can resolve our modules properly
config.resolver.alias = {
  '@': __dirname,
  '@components': `${__dirname}/components`,
  '@lib': `${__dirname}/lib`,
  '@styles': `${__dirname}/styles`,
  '@theme': `${__dirname}/theme`,
  '@hooks': `${__dirname}/hooks`,
};

module.exports = config;
