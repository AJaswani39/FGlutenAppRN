import 'dotenv/config';

const appVariant = process.env.APP_VARIANT ?? "production";
const isStaging = appVariant === "staging";

export default {
  expo: {
    name: isStaging ? "FGlutenApp (Staging)" : "FGlutenApp",
    slug: "fgluten-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0D1117",
    },
    updates: {
      url: "https://u.expo.dev/a445e80b-b3b6-4d3d-9b44-e0949b962c4d",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "io.fgluten.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "FGlutenApp uses your location to find gluten-free friendly restaurants near you.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "FGlutenApp uses your location to find gluten-free friendly restaurants near you.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0D1117",
      },
      package: isStaging ? "io.fgluten.app.staging" : "io.fgluten.app",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "INTERNET",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "FGlutenApp uses your location to find gluten-free restaurants near you.",
        },
      ],
    ],
    extra: {
      appVariant,
      MAPS_API_KEY: process.env.GCP_API_KEY ?? "",
      eas: {
        projectId: "a445e80b-b3b6-4d3d-9b44-e0949b962c4d",
      },
    },
  },
};
