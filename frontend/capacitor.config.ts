import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.NexMedicon_AI.app',
  appName: 'NexMedicon AI',
  webDir: 'out',
  server: {
    // This points your app to your live backend
    // Replace with your actual Railway backend URL
    url: "https://mediconnect-healthcare-system-production.up.railway.app/",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0B2545",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
