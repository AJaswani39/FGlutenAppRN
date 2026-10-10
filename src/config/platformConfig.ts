import { Platform } from 'react-native';
import { getRuntimeConfig } from '../config/runtimeConfig';

export function getMapsApiKey(): string {
  const config = getRuntimeConfig();
  if (Platform.OS === 'android') {
    return config.androidMapsApiKey ?? config.mapsApiKey ?? '';
  }
  if (Platform.OS === 'ios') {
    return config.iosMapsApiKey ?? config.mapsApiKey ?? '';
  }

  return config.mapsApiKey ?? config.androidMapsApiKey ?? config.iosMapsApiKey ?? '';
}

export function getAiProxyBaseUrl(): string {
  return getRuntimeConfig().aiProxyBaseUrl;
}