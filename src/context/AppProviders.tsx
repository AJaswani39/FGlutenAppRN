import React from 'react';
import { SettingsProvider } from './SettingsContext';
import { FiltersProvider } from './FiltersContext';
import { RestaurantProvider } from './RestaurantContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <FiltersProvider>
        <RestaurantProvider>
          {children}
        </RestaurantProvider>
      </FiltersProvider>
    </SettingsProvider>
  );
}