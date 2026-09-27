module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            '@api': './src/api',
            '@theme': './src/theme/index',
            '@store': './src/store',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@components': './src/components',
          },
        },
      ],
    ],
  };
};
