import Constants from 'expo-constants';

export interface RuntimeConfig {
  mapsApiKey?: string;
  androidMapsApiKey?: string;
  iosMapsApiKey?: string;
  aiProxyBaseUrl: string;
  puterApiKey: string;
  visionApiKey: string;
  appVersion: string;
}

interface ExpoConfigExtra {
  MAPS_API_KEY?: string;
  ANDROID_MAPS_API_KEY?: string;
  IOS_MAPS_API_KEY?: string;
  AI_PROXY_BASE_URL?: string;
  PUTER_API_KEY?: string;
  VISION_API_KEY?: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  const extra = Constants.expoConfig?.extra as ExpoConfigExtra | undefined;

  return {
    mapsApiKey: extra?.MAPS_API_KEY,
    androidMapsApiKey: extra?.ANDROID_MAPS_API_KEY,
    iosMapsApiKey: extra?.IOS_MAPS_API_KEY,
    aiProxyBaseUrl: extra?.AI_PROXY_BASE_URL ?? '',
    puterApiKey: extra?.PUTER_API_KEY ?? '',
    visionApiKey: extra?.VISION_API_KEY ?? '',
    appVersion: Constants.expoConfig?.version ?? '1.0',
  };
}
