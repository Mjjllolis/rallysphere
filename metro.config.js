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

// Block @stripe/stripe-react-native on web to prevent bundling errors
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    // Return an empty module for web
    return {
      filePath: require.resolve('./lib/stripe-web-stub.js'),
      type: 'sourceFile',
    };
  }

  // Use default resolver for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
