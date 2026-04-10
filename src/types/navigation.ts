import { Restaurant } from './restaurant';

export type RootTabParamList = {
  Home: undefined;
  Restaurants: undefined;
  Profile: undefined;
};

export type RestaurantStackParamList = {
  RestaurantList: undefined;
  RestaurantDetail: { restaurant: Restaurant };
  MenuAnalysis: { restaurantName: string; menuText: string };
};
