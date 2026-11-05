import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.teleptech.framlog.app',  // amit megadtál
  appName: 'farmlogpro-app',           // human név
  webDir: 'dist',                      // Vite build kimenet
  bundledWebRuntime: false,
};

export default config;
