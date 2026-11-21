import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seutengim8.mysocial',
  appName: 'MySocial',
  webDir: 'public',
  server: { androidScheme: 'https' },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] }
  }
};

export default config;
