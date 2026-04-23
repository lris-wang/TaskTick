import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tasktick.app",
  appName: "TaskTick",
  webDir: "../web/dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0f",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0f",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notification",
      iconColor: "#18a0ff",
      sound: "default",
    },
    Updater: {
      autoUpdate: true,
      updateEndpoint: "https://releases.tasktick.com/updates",
    },
  },
};

export default config;
