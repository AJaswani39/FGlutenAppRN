
/**
 * UI Formatting utilities
 */

/**
 * Formats a distance in meters to a human-readable string, using either miles or kilometers based on the `useMiles` flag.
 * If the distance is less than or equal to zero, returns an empty string.
 * For miles, distances are formatted to one decimal place if greater than or equal to 0.1 miles; otherwise, they are converted to feet and rounded.
 * For kilometers, distances are formatted to one decimal place if greater than or equal to 1 km; otherwise, they are rounded to the nearest meter.
 * @param meters The distance in meters to format.
 * @param useMiles A boolean indicating whether to format the distance in miles (true) or kilometers (false).
 * @returns A formatted string representing the distance, or an empty string if the distance is invalid.
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
