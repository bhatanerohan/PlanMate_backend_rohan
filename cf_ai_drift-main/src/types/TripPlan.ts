export interface Coordinates {
  lat: number;
  lng: number;
}

export type ItemType = 'flight' | 'hotel' | 'activity' | 'train' | 'food' | 'museum';

export interface TripItem {
  id: string;
  type: ItemType;
  name: string;
  price: number;
  currency: string;
  coordinates: Coordinates;
  bookingUrl?: string;
  provider?: string;
  time?: string;
  duration?: string;
  description?: string;
  rating?: number;
  reviewCount?: string;
  imageUrl?: string;
  videoUrl?: string;

  // Array of media for the "Story" mode
  gallery?: {
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
  }[];

  metadata?: {
    platform?: string;
    seat?: string;
    flightNumber?: string;
    gate?: string;
    confirmation?: string;
  };
  isEstimate?: boolean;

  // Determines if this item is 'Reel-worthy'
  hasReel?: boolean;

  // The slug for scraping Instagram (e.g. 'colosseum-rome')
  instagramSearchTerm?: string;
}

export interface Day {
  id: string;
  date: string;
  title: string;
  subtitle?: string; // e.g., "Monday, October 14th"
  items: TripItem[];
}

export interface TripPlan {
  id: string;
  destination: string;
  dates: string;
  totalBudget: number;
  currency: string;
  days: Day[];
  travelers: number;
  isDemo?: boolean; // Indicates if this plan was generated in Demo/Recording mode
}
