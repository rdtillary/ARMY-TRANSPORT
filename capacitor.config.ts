import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.army.transport.cms',
  appName: 'Army Transport',
  webDir: 'out',
  server: {
    url: 'https://mctetransportsys.onrender.com', 
    androidScheme: 'https'
  }
};

export default config;
