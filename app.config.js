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
      config: {
        googleMapsApiKey: process.env.GCP_API_KEY ?? "",
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "FGlutenApp uses your location to find gluten-free friendly restaurants near you.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "FGlutenApp uses your location to find gluten-free friendly restaurants near you.",
        NSPhotoLibraryUsageDescription:
          "FGlutenApp lets you choose menu photos to scan for gluten-free safety clues.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0D1117",
      },
      package: isStaging ? "io.fgluten.app.staging" : "io.fgluten.app",
      config: {
        googleMaps: {
          apiKey: process.env.GCP_API_KEY ?? "",
        },
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "INTERNET",
        "READ_MEDIA_IMAGES",
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
      [
        "expo-image-picker",
        {
          photosPermission:
            "FGlutenApp lets you choose menu photos to scan for gluten-free safety clues.",
        },
      ],
      "expo-clipboard",
    ],
    extra: {
      appVariant,
      MAPS_API_KEY: process.env.GCP_API_KEY ?? "",
      VISION_API_KEY: process.env.GCP_VISION_API_KEY ?? process.env.GCP_API_KEY ?? "",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
      eas: {
        projectId: "a445e80b-b3b6-4d3d-9b44-e0949b962c4d",
      },
    },
  },
};
