import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, FlatList, Text, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import Constants from 'expo-constants';
import { Colors, Radius, Spacing, FontSize, FontWeight } from '../theme/colors';
import { Ionicons } from './ui';

export interface LocationSearchResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface Props {
  onLocationSelected: (lat: number, lng: number) => void;
}

export function LocationSearchBar({ onLocationSelected }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const API_KEY = (Constants.expoConfig?.extra as any)?.MAPS_API_KEY || '';

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    const fetchPlaces = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=(cities)&key=${API_KEY}`
        );
        const json = await res.json();
        
        if (json.status === 'OK') {
          const formatted = json.predictions.map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting.main_text,
            secondaryText: p.structured_formatting.secondary_text,
          }));
          setResults(formatted);
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error('Failed to fetch autocomplete:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchPlaces, 500);
    return () => clearTimeout(timeoutId);
  }, [query, API_KEY]);

  const handleSelect = async (placeId: string) => {
    Keyboard.dismiss();
    setIsFocused(false);
    setQuery('');
    setResults([]);
    setIsLoading(true);
    
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${API_KEY}`
      );
      const json = await res.json();
      if (json.status === 'OK') {
        const { lat, lng } = json.result.geometry.location;
        onLocationSelected(lat, lng);
      }
    } catch (error) {
      console.error('Failed to fetch place details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder="Search any city..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Keep focused if we have results so they don't disappear on iOS
            if (results.length === 0 && !query) {
              setIsFocused(false);
            }
          }}
          returnKeyType="search"
        />
        {isLoading && <ActivityIndicator size="small" color={Colors.primary} />}
        {query.length > 0 && !isLoading && (
          <Pressable onPress={() => { setQuery(''); setResults([]); }}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {isFocused && results.length > 0 && (
        <View style={styles.resultsContainer}>
          <FlatList
            data={results}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.resultItem} onPress={() => handleSelect(item.placeId)}>
                <Ionicons name="location-outline" size={20} color={Colors.textSecondary} style={styles.resultIcon} />
                <View style={styles.resultTextGroup}>
                  <Text style={styles.mainText}>{item.mainText}</Text>
                  <Text style={styles.secondaryText}>{item.secondaryText}</Text>
                </View>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, // Clear safe area / status bar
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    elevation: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  searchBoxFocused: {
    borderColor: Colors.primary,
  },
  input: {
    flex: 1,
    marginLeft: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    height: '100%',
  },
  resultsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  resultIcon: {
    marginRight: Spacing.md,
  },
  resultTextGroup: {
    flex: 1,
  },
  mainText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  secondaryText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 48,
  },
});
