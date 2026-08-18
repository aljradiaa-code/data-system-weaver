import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.goldai.v2',
  appName: 'Gold AI v2',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: '',
      keystoreAlias: '',
    },
  },
};

export default config;
