
/**
 * UI Formatting utilities
 */

export const formatDistance = (meters: number, useMiles: boolean): string => {
  if (!Number.isFinite(meters) || meters <= 0) return '';

  if (useMiles) {
    const miles = meters / 1609.34;
    if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  } else {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }
};
