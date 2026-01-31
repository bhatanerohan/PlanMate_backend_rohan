/**
 * Aggregators Service
 * Simulates external API calls for hotels, flights, and activities
 */

// ============ Type Definitions ============

export interface HotelOption {
    id: string;
    name: string;
    description: string;
    location: {
        address: string;
        lat: number;
        lng: number;
    };
    starRating: number;
    pricePerNight: number;
    currency: string;
    amenities: string[];
    imageUrl: string;
    bookingUrl: string;
    reviewScore: number;
    reviewCount: number;
}

export interface FlightOption {
    id: string;
    airline: string;
    flightNumber: string;
    departure: {
        airport: string;
        airportCode: string;
        time: string; // ISO datetime
        terminal?: string;
    };
    arrival: {
        airport: string;
        airportCode: string;
        time: string; // ISO datetime
        terminal?: string;
    };
    duration: string; // e.g. "12h 30m"
    stops: number;
    stopoverCities?: string[];
    price: number;
    currency: string;
    cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
    seatsAvailable: number;
    bookingUrl: string;
}

export interface ActivityOption {
    id: string;
    name: string;
    description: string;
    category: string;
    location: {
        address: string;
        lat: number;
        lng: number;
    };
    duration: string; // e.g. "3 hours"
    price: number;
    currency: string;
    rating: number;
    reviewCount: number;
    imageUrl: string;
    bookingUrl: string;
    highlights: string[];
    bestTimeToVisit?: string;
}

// ============ Destination Coordinates ============

const destinationCoords: Record<string, { lat: number; lng: number; timezone: string }> = {
    'paris': { lat: 48.8566, lng: 2.3522, timezone: 'Europe/Paris' },
    'tokyo': { lat: 35.6762, lng: 139.6503, timezone: 'Asia/Tokyo' },
    'new york': { lat: 40.7128, lng: -74.0060, timezone: 'America/New_York' },
    'london': { lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' },
    'rome': { lat: 41.9028, lng: 12.4964, timezone: 'Europe/Rome' },
    'barcelona': { lat: 41.3851, lng: 2.1734, timezone: 'Europe/Madrid' },
    'bali': { lat: -8.3405, lng: 115.0920, timezone: 'Asia/Makassar' },
    'dubai': { lat: 25.2048, lng: 55.2708, timezone: 'Asia/Dubai' },
    'sydney': { lat: -33.8688, lng: 151.2093, timezone: 'Australia/Sydney' },
    'los angeles': { lat: 34.0522, lng: -118.2437, timezone: 'America/Los_Angeles' },
    'san francisco': { lat: 37.7749, lng: -122.4194, timezone: 'America/Los_Angeles' },
    'miami': { lat: 25.7617, lng: -80.1918, timezone: 'America/New_York' },
    'amsterdam': { lat: 52.3676, lng: 4.9041, timezone: 'Europe/Amsterdam' },
    'singapore': { lat: 1.3521, lng: 103.8198, timezone: 'Asia/Singapore' },
    'hong kong': { lat: 22.3193, lng: 114.1694, timezone: 'Asia/Hong_Kong' },
    'bangkok': { lat: 13.7563, lng: 100.5018, timezone: 'Asia/Bangkok' },
    'istanbul': { lat: 41.0082, lng: 28.9784, timezone: 'Europe/Istanbul' },
    'mexico city': { lat: 19.4326, lng: -99.1332, timezone: 'America/Mexico_City' },
    'cairo': { lat: 30.0444, lng: 31.2357, timezone: 'Africa/Cairo' },
    'cape town': { lat: -33.9249, lng: 18.4241, timezone: 'Africa/Johannesburg' },
    'default': { lat: 48.8566, lng: 2.3522, timezone: 'UTC' },
};

// ============ Helper Functions ============

function getDestinationCoords(destination: string): { lat: number; lng: number } {
    const key = destination.toLowerCase();
    for (const [name, coords] of Object.entries(destinationCoords)) {
        if (key.includes(name) || name.includes(key)) {
            return { lat: coords.lat, lng: coords.lng };
        }
    }
    return { lat: destinationCoords.default.lat, lng: destinationCoords.default.lng };
}

function randomOffset(base: number, range: number = 0.05): number {
    return base + (Math.random() - 0.5) * range * 2;
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

// ============ Mock Data Generators ============

const hotelNames = [
    'Grand Palace Hotel', 'The Ritz Carlton', 'Marriott Downtown', 'Hilton Garden Inn',
    'Four Seasons Resort', 'Hyatt Regency', 'InterContinental', 'Westin Premier',
    'Sofitel Luxury', 'Mandarin Oriental', 'Park Hyatt', 'St. Regis',
    'W Hotel', 'Ace Hotel', 'The Standard', 'Nobu Hotel'
];

const hotelAmenities = [
    'Free WiFi', 'Pool', 'Spa', 'Gym', 'Restaurant', 'Bar', 'Room Service',
    'Concierge', 'Airport Shuttle', 'Parking', 'Pet Friendly', 'Business Center',
    'Rooftop Terrace', 'Beach Access', 'Kids Club', 'Electric Vehicle Charging'
];

const airlines = [
    { name: 'United Airlines', code: 'UA' },
    { name: 'American Airlines', code: 'AA' },
    { name: 'Delta Air Lines', code: 'DL' },
    { name: 'British Airways', code: 'BA' },
    { name: 'Emirates', code: 'EK' },
    { name: 'Singapore Airlines', code: 'SQ' },
    { name: 'Air France', code: 'AF' },
    { name: 'Lufthansa', code: 'LH' },
    { name: 'Japan Airlines', code: 'JL' },
    { name: 'Qatar Airways', code: 'QR' },
];

const activityCategories = {
    'cultural': ['Museum Tour', 'Historical Walking Tour', 'Art Gallery Visit', 'Temple Visit', 'Palace Tour'],
    'adventure': ['Hiking Expedition', 'Zip-lining Adventure', 'Scuba Diving', 'Paragliding', 'Rock Climbing'],
    'foodie': ['Food Tour', 'Cooking Class', 'Wine Tasting', 'Street Food Walk', 'Fine Dining Experience'],
    'relaxing': ['Spa Day', 'Beach Relaxation', 'Yoga Retreat', 'Hot Springs Visit', 'Garden Stroll'],
    'romantic': ['Sunset Cruise', 'Couples Massage', 'Private Dinner', 'Gondola Ride', 'Stargazing Tour'],
    'nature': ['Safari Tour', 'Botanical Garden', 'Waterfall Hike', 'Wildlife Sanctuary', 'National Park Tour'],
    'luxury': ['Private Yacht Charter', 'Helicopter Tour', 'VIP Shopping Experience', 'Michelin Dining', 'Exclusive Club Access'],
};

// ============ Exported Functions ============

/**
 * Fetch hotel options for a destination
 */
export async function fetchHotels(
    destination: string,
    checkIn: string,
    budget: number
): Promise<HotelOption[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const coords = getDestinationCoords(destination);
    const maxPricePerNight = Math.min(budget / 3, 800); // Assume ~3 nights avg

    const hotels: HotelOption[] = [];

    for (let i = 0; i < 10; i++) {
        const starRating = Math.min(5, Math.max(3, Math.floor(Math.random() * 3) + 3));
        const basePriceMultiplier = starRating === 5 ? 2.5 : starRating === 4 ? 1.5 : 1;
        const pricePerNight = Math.round((50 + Math.random() * maxPricePerNight) * basePriceMultiplier);

        const numAmenities = 4 + Math.floor(Math.random() * 6);
        const shuffledAmenities = [...hotelAmenities].sort(() => Math.random() - 0.5);

        hotels.push({
            id: `hotel_${generateId()}`,
            name: `${hotelNames[i % hotelNames.length]} ${destination}`,
            description: `A ${starRating}-star hotel in the heart of ${destination}, offering exceptional comfort and world-class amenities.`,
            location: {
                address: `${100 + i * 10} ${destination} Main Street`,
                lat: randomOffset(coords.lat, 0.02),
                lng: randomOffset(coords.lng, 0.02),
            },
            starRating,
            pricePerNight,
            currency: 'USD',
            amenities: shuffledAmenities.slice(0, numAmenities),
            imageUrl: `https://images.unsplash.com/photo-${1566073771259 + i}-e63ae2a57da0?w=800`,
            bookingUrl: `https://booking.example.com/hotel/${generateId()}`,
            reviewScore: +(3.5 + Math.random() * 1.5).toFixed(1),
            reviewCount: Math.floor(200 + Math.random() * 2000),
        });
    }

    return hotels.sort((a, b) => b.reviewScore - a.reviewScore);
}

/**
 * Fetch flight options between two cities
 */
export async function fetchFlights(
    origin: string,
    destination: string,
    date: string
): Promise<FlightOption[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const flights: FlightOption[] = [];
    const departureDate = new Date(date);

    for (let i = 0; i < 8; i++) {
        const airline = airlines[i % airlines.length];
        const flightNum = `${airline.code}${100 + Math.floor(Math.random() * 900)}`;

        // Random departure time between 6am and 10pm
        const depHour = 6 + Math.floor(Math.random() * 16);
        const depMin = Math.floor(Math.random() * 60);
        departureDate.setHours(depHour, depMin, 0, 0);

        // Flight duration 2-16 hours
        const durationHours = 2 + Math.floor(Math.random() * 14);
        const durationMins = Math.floor(Math.random() * 60);
        const arrivalDate = new Date(departureDate.getTime() + (durationHours * 60 + durationMins) * 60000);

        const stops = Math.random() > 0.6 ? (Math.random() > 0.5 ? 2 : 1) : 0;
        const basePrice = 200 + durationHours * 50 + Math.random() * 500;
        const cabinClasses: FlightOption['cabinClass'][] = ['economy', 'premium_economy', 'business', 'first'];
        const cabinClass = cabinClasses[Math.floor(Math.random() * (i < 4 ? 2 : 4))];
        const cabinMultiplier = cabinClass === 'first' ? 4 : cabinClass === 'business' ? 2.5 : cabinClass === 'premium_economy' ? 1.5 : 1;

        flights.push({
            id: `flight_${generateId()}`,
            airline: airline.name,
            flightNumber: flightNum,
            departure: {
                airport: `${origin} International Airport`,
                airportCode: origin.substring(0, 3).toUpperCase(),
                time: departureDate.toISOString(),
                terminal: `Terminal ${Math.ceil(Math.random() * 5)}`,
            },
            arrival: {
                airport: `${destination} International Airport`,
                airportCode: destination.substring(0, 3).toUpperCase(),
                time: arrivalDate.toISOString(),
                terminal: `Terminal ${Math.ceil(Math.random() * 4)}`,
            },
            duration: `${durationHours}h ${durationMins}m`,
            stops,
            stopoverCities: stops > 0 ? ['Dubai', 'London', 'Frankfurt'].slice(0, stops) : undefined,
            price: Math.round(basePrice * cabinMultiplier),
            currency: 'USD',
            cabinClass,
            seatsAvailable: Math.floor(Math.random() * 20) + 1,
            bookingUrl: `https://flights.example.com/book/${generateId()}`,
        });
    }

    return flights.sort((a, b) => a.price - b.price);
}

/**
 * Fetch activity options for a destination based on interests
 */
export async function fetchActivities(
    destination: string,
    interests: string[]
): Promise<ActivityOption[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const coords = getDestinationCoords(destination);
    const activities: ActivityOption[] = [];

    // If no interests specified, use a mix
    const selectedInterests = interests.length > 0
        ? interests
        : ['cultural', 'foodie', 'adventure'];

    for (const interest of selectedInterests) {
        const category = interest.toLowerCase();
        const activityNames = activityCategories[category as keyof typeof activityCategories]
            || activityCategories.cultural;

        for (let i = 0; i < 3; i++) {
            const name = activityNames[i % activityNames.length];
            const durationHours = 1 + Math.floor(Math.random() * 5);

            activities.push({
                id: `activity_${generateId()}`,
                name: `${name} in ${destination}`,
                description: `Experience an unforgettable ${name.toLowerCase()} during your visit to ${destination}. Perfect for ${category} enthusiasts.`,
                category: category.charAt(0).toUpperCase() + category.slice(1),
                location: {
                    address: `${destination} ${category.charAt(0).toUpperCase() + category.slice(1)} District`,
                    lat: randomOffset(coords.lat, 0.03),
                    lng: randomOffset(coords.lng, 0.03),
                },
                duration: `${durationHours} hour${durationHours > 1 ? 's' : ''}`,
                price: Math.round(20 + Math.random() * 150),
                currency: 'USD',
                rating: +(4 + Math.random()).toFixed(1),
                reviewCount: Math.floor(50 + Math.random() * 500),
                imageUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 100000000000)}?w=800`,
                bookingUrl: `https://activities.example.com/book/${generateId()}`,
                highlights: [
                    'Expert local guide',
                    'Small group experience',
                    'Skip-the-line access',
                    'Photo opportunities',
                ].slice(0, 2 + Math.floor(Math.random() * 3)),
                bestTimeToVisit: ['Morning', 'Afternoon', 'Evening', 'All day'][Math.floor(Math.random() * 4)],
            });
        }
    }

    return activities.sort((a, b) => b.rating - a.rating);
}

// ============ Scout Pattern - Activity Providers ============

/**
 * Activity item with provider information
 */
export interface ActivityItem extends ActivityOption {
    provider: 'Viator' | 'Klook' | 'GetYourGuide' | 'Headout' | 'Generic';
}

/**
 * Stay/Accommodation option
 */
export interface StayOption extends HotelOption {
    provider: 'Airbnb' | 'Booking.com' | 'Hotels.com' | 'Generic';
    propertyType: 'hotel' | 'apartment' | 'house' | 'villa' | 'hostel';
    totalPrice?: number; // Total for the stay
    nights?: number;
}

/**
 * Aggregated results from all scouts for a segment
 */
export interface SegmentScoutResults {
    availableStays: StayOption[];
    availableActivities: ActivityItem[];
}

/**
 * TripSegment interface (imported type for the master function)
 */
export interface TripSegment {
    order: number;
    location: string;
    checkIn: string;
    checkOut: string;
    searchQueries: {
        stays: string;
        activityKeywords: string[];
    };
}

// Viator activity names by keyword
const viatorActivities: Record<string, string[]> = {
    'default': ['Skip-the-Line Tour', 'Private Guided Walk', 'Sunset Experience', 'Day Trip', 'Food & Wine Tour'],
    'temple': ['Ancient Temple Tour', 'Spiritual Temple Walk', 'Morning Temple Ceremony'],
    'food': ['Local Food Tour', 'Cooking Class', 'Street Food Adventure', 'Michelin Restaurant Experience'],
    'museum': ['Museum Skip-the-Line', 'Art Gallery Tour', 'Cultural Heritage Walk'],
    'nature': ['National Park Day Trip', 'Hiking Adventure', 'Wildlife Safari'],
};

// Klook activity names
const klookActivities = [
    'Express Pass Experience', 'Theme Park Tickets', 'Cultural Workshop',
    'Transport Pass', 'Attraction Combo Ticket', 'Local Experience',
    'Day Tour Package', 'Airport Transfer', 'WiFi & SIM Card'
];

// Airbnb property types
const airbnbTypes = [
    { type: 'apartment', prefix: 'Stylish' },
    { type: 'house', prefix: 'Cozy' },
    { type: 'villa', prefix: 'Luxury' },
    { type: 'apartment', prefix: 'Modern' },
    { type: 'house', prefix: 'Charming' },
];

/**
 * Fetch activities from Viator
 */
export async function fetchViatorActivities(
    location: string,
    keywords: string[]
): Promise<ActivityItem[]> {
    await new Promise(resolve => setTimeout(resolve, 80));

    const coords = getDestinationCoords(location);
    const activities: ActivityItem[] = [];

    for (const keyword of keywords.slice(0, 5)) {
        const keywordLower = keyword.toLowerCase();
        const matchedActivities = viatorActivities[keywordLower] || viatorActivities.default;
        const activityName = matchedActivities[Math.floor(Math.random() * matchedActivities.length)];
        const durationHours = 2 + Math.floor(Math.random() * 4);
        const encodedKeyword = encodeURIComponent(keyword);

        activities.push({
            id: `viator_${generateId()}`,
            name: `${keyword}: ${activityName}`,
            description: `Explore ${keyword} with this highly-rated Viator experience in ${location}. Expert guides and skip-the-line access included.`,
            category: 'Tours & Activities',
            provider: 'Viator',
            location: {
                address: `${location} - ${keyword} Area`,
                lat: randomOffset(coords.lat, 0.02),
                lng: randomOffset(coords.lng, 0.02),
            },
            duration: `${durationHours} hours`,
            price: Math.round(40 + Math.random() * 120),
            currency: 'USD',
            rating: +(4.2 + Math.random() * 0.7).toFixed(1),
            reviewCount: Math.floor(100 + Math.random() * 1500),
            imageUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 100000000000)}?w=800`,
            bookingUrl: `https://www.viator.com/searchResults/all?text=${encodedKeyword}&destId=${location.replace(/\s/g, '')}`,
            highlights: [
                'Skip-the-line access',
                'Expert local guide',
                'Small group (max 12)',
                'Hotel pickup available',
            ].slice(0, 2 + Math.floor(Math.random() * 2)),
            bestTimeToVisit: ['Morning', 'Afternoon'][Math.floor(Math.random() * 2)],
        });
    }

    return activities;
}

/**
 * Klook API activity response structure
 */
interface KlookApiActivity {
    id: string | number;
    title: string;
    price: number | string;
    activity_url: string;
    image_url: string;
    rating: number;
    duration: string;
    [key: string]: any;
}

/**
 * Fetch activities from Klook using Browser Use API
 * 
 * @param location - The destination city/location
 * @param date - Optional date for the activity (YYYY-MM-DD format)
 * @param budget - Optional max price filter
 * @returns Array of ActivityItem objects from Klook
 */
export async function fetchKlookActivities(
    location: string,
    date?: string | null,
    budget?: number | null
): Promise<ActivityItem[]> {
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Klook API fetch');
        // Fall back to mock data
        return fetchKlookActivitiesMock(location);
    }

    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/ebf4715e-4bf3-4263-8bf2-af82aeef3829/execute';

    try {
        console.log(`🎫 Fetching Klook activities for ${location}...`);

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Browser-Use-API-Key': apiKey,
            },
            body: JSON.stringify({
                parameters: {
                    location,
                    date: date || null,
                    max_price: budget || null,
                    currency: 'USD',
                },
            }),
        });

        if (!response.ok) {
            console.error(`❌ Klook API error: ${response.status} ${response.statusText}`);
            return fetchKlookActivitiesMock(location);
        }

        const data = await response.json() as any;
        // Handle nested response: { success: true, result: { success: true, data: { activities: [...] } } }
        const responseData = data.result?.data || data.data || data;
        const items: KlookApiActivity[] = responseData.activities || responseData.results || responseData.items || [];

        if (!Array.isArray(items)) {
            console.warn('⚠️ Unexpected Klook API response format:', JSON.stringify(data).substring(0, 200));
            return fetchKlookActivitiesMock(location);
        }

        console.log(`✅ Received ${items.length} Klook activities`);

        // Map API response to ActivityItem format
        const activities: ActivityItem[] = items.map((item) => {
            // Parse price - handle both number and string formats
            let price = 0;
            if (typeof item.price === 'number') {
                price = item.price;
            } else if (typeof item.price === 'string') {
                price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
            }

            return {
                id: `klook-${item.id || Date.now()}`,
                name: item.title || 'Klook Activity',
                description: `Book this activity in ${location} through Klook.`,
                category: 'Tours & Activities',
                provider: 'Klook',
                location: {
                    address: location,
                    lat: 0, // Will be geocoded in next step
                    lng: 0,
                },
                duration: item.duration || 'Varies',
                price,
                currency: 'USD',
                rating: item.rating || 0,
                reviewCount: 0,
                // Check multiple possible image field names
                imageUrl: item.image_url || item.imageUrl || item.image || item.photo || item.img || item.thumbnail || '',
                bookingUrl: item.activity_url || `https://www.klook.com/search/?query=${encodeURIComponent(location)}`,
                highlights: ['Instant confirmation', 'Mobile voucher'],
                bestTimeToVisit: 'All day',
            };
        });

        return activities;

    } catch (error) {
        console.error('❌ Error fetching Klook activities:', error);
        return fetchKlookActivitiesMock(location);
    }
}

/**
 * Mock fallback for Klook activities when API is unavailable
 */
function fetchKlookActivitiesMock(location: string): ActivityItem[] {
    const coords = getDestinationCoords(location);
    const activities: ActivityItem[] = [];
    const encodedLocation = encodeURIComponent(location);

    for (let i = 0; i < 6; i++) {
        const activityName = klookActivities[i % klookActivities.length];
        const durationHours = 1 + Math.floor(Math.random() * 6);

        activities.push({
            id: `klook_${generateId()}`,
            name: `${location} ${activityName}`,
            description: `Book this popular ${activityName.toLowerCase()} in ${location} through Klook. Instant confirmation and mobile voucher.`,
            category: 'Tickets & Passes',
            provider: 'Klook',
            location: {
                address: `Central ${location}`,
                lat: randomOffset(coords.lat, 0.025),
                lng: randomOffset(coords.lng, 0.025),
            },
            duration: durationHours > 4 ? 'Full day' : `${durationHours} hours`,
            price: Math.round(15 + Math.random() * 80),
            currency: 'USD',
            rating: +(4.0 + Math.random() * 0.9).toFixed(1),
            reviewCount: Math.floor(200 + Math.random() * 3000),
            imageUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 100000000000)}?w=800`,
            bookingUrl: `https://www.klook.com/search/?query=${encodedLocation}%20${encodeURIComponent(activityName)}`,
            highlights: [
                'Instant confirmation',
                'Mobile voucher accepted',
                'Free cancellation',
                'Best price guarantee',
            ].slice(0, 2 + Math.floor(Math.random() * 2)),
            bestTimeToVisit: 'All day',
        });
    }

    return activities;
}

/**
 * Fetch stays from Airbnb
 */
export async function fetchAirbnb(
    location: string,
    checkIn: string,
    checkOut: string
): Promise<StayOption[]> {
    await new Promise(resolve => setTimeout(resolve, 80));

    const coords = getDestinationCoords(location);
    const stays: StayOption[] = [];
    const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24));
    const encodedLocation = encodeURIComponent(location);

    for (let i = 0; i < 5; i++) {
        const propertyInfo = airbnbTypes[i % airbnbTypes.length];
        const pricePerNight = Math.round(80 + Math.random() * 250);
        const numAmenities = 4 + Math.floor(Math.random() * 5);
        const shuffledAmenities = [...hotelAmenities].sort(() => Math.random() - 0.5);

        stays.push({
            id: `airbnb_${generateId()}`,
            name: `${propertyInfo.prefix} ${propertyInfo.type.charAt(0).toUpperCase() + propertyInfo.type.slice(1)} in ${location}`,
            description: `Beautiful ${propertyInfo.type} in the heart of ${location}. Perfect for travelers seeking comfort and local experience.`,
            provider: 'Airbnb',
            propertyType: propertyInfo.type as StayOption['propertyType'],
            location: {
                address: `${location} City Center`,
                lat: randomOffset(coords.lat, 0.015),
                lng: randomOffset(coords.lng, 0.015),
            },
            starRating: 0, // Airbnb doesn't use stars
            pricePerNight,
            totalPrice: pricePerNight * nights,
            nights,
            currency: 'USD',
            amenities: shuffledAmenities.slice(0, numAmenities),
            imageUrl: `https://images.unsplash.com/photo-${1566073771259 + i * 100}-e63ae2a57da0?w=800`,
            bookingUrl: `https://www.airbnb.com/s/${encodedLocation}/homes?checkin=${checkIn}&checkout=${checkOut}`,
            reviewScore: +(4.3 + Math.random() * 0.6).toFixed(1),
            reviewCount: Math.floor(50 + Math.random() * 500),
        });
    }

    return stays.sort((a, b) => b.reviewScore - a.reviewScore);
}

/**
 * Fetch stays from Booking.com
 */
export async function fetchBooking(
    location: string,
    checkIn: string,
    checkOut: string
): Promise<StayOption[]> {
    await new Promise(resolve => setTimeout(resolve, 80));

    const coords = getDestinationCoords(location);
    const stays: StayOption[] = [];
    const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24));
    const encodedLocation = encodeURIComponent(location);

    for (let i = 0; i < 5; i++) {
        const starRating = 3 + Math.floor(Math.random() * 3);
        const pricePerNight = Math.round((60 + Math.random() * 200) * (starRating / 3));
        const numAmenities = 5 + Math.floor(Math.random() * 5);
        const shuffledAmenities = [...hotelAmenities].sort(() => Math.random() - 0.5);

        stays.push({
            id: `booking_${generateId()}`,
            name: `${hotelNames[i % hotelNames.length]} ${location}`,
            description: `${starRating}-star hotel in ${location} with excellent amenities and prime location. Book on Booking.com for best rates.`,
            provider: 'Booking.com',
            propertyType: 'hotel',
            location: {
                address: `${100 + i * 20} ${location} Boulevard`,
                lat: randomOffset(coords.lat, 0.02),
                lng: randomOffset(coords.lng, 0.02),
            },
            starRating,
            pricePerNight,
            totalPrice: pricePerNight * nights,
            nights,
            currency: 'USD',
            amenities: shuffledAmenities.slice(0, numAmenities),
            imageUrl: `https://images.unsplash.com/photo-${1566073771259 + i * 50}-e63ae2a57da0?w=800`,
            bookingUrl: `https://www.booking.com/searchresults.html?ss=${encodedLocation}&checkin=${checkIn}&checkout=${checkOut}`,
            reviewScore: +(3.8 + Math.random() * 1.1).toFixed(1),
            reviewCount: Math.floor(200 + Math.random() * 2000),
        });
    }

    return stays.sort((a, b) => b.reviewScore - a.reviewScore);
}

// ============ Master Scout Function ============

/**
 * Fetch all available stays and activities for a trip segment
 * This is the master scout function that aggregates data from all providers
 * 
 * @param segment - The trip segment with location and dates
 * @param travelers - Number of travelers (needed for real Airbnb API)
 */
export async function fetchAllForSegment(
    segment: TripSegment,
    travelers: number = 2
): Promise<SegmentScoutResults> {
    console.log(`🔍 Scouting for segment: ${segment.location} (${segment.checkIn} to ${segment.checkOut})`);

    // Parallel fetch for mock stays
    const mockStaysPromise = Promise.all([
        fetchAirbnb(segment.location, segment.checkIn, segment.checkOut),
        fetchBooking(segment.location, segment.checkIn, segment.checkOut),
    ]);

    // Real Airbnb API fetch (returns TripItem[], handled separately)
    const realAirbnbPromise = fetchAirbnbListings(segment.location, segment.checkIn, segment.checkOut, travelers);

    // Parallel fetch for activities
    const activitiesPromise = Promise.all([
        fetchViatorActivities(segment.location, segment.searchQueries.activityKeywords),
        fetchKlookActivities(segment.location),
    ]);

    // Wait for all fetches to complete
    const [mockStaysResults, realAirbnbListings, activitiesResults] = await Promise.all([
        mockStaysPromise,
        realAirbnbPromise,
        activitiesPromise,
    ]);

    // Flatten mock stays
    const mockStays = mockStaysResults.flat();

    // Convert real Airbnb TripItems to StayOption format for consistency
    const realAirbnbStays: StayOption[] = realAirbnbListings.map(listing => ({
        id: listing.id,
        name: listing.name,
        description: listing.description || `Airbnb listing in ${segment.location}`,
        provider: 'Airbnb' as const,
        propertyType: 'apartment' as const,
        location: {
            address: segment.location,
            lat: listing.coordinates.lat,
            lng: listing.coordinates.lng,
        },
        starRating: 0,
        pricePerNight: listing.price,
        totalPrice: listing.price,
        currency: listing.currency,
        amenities: [],
        imageUrl: listing.imageUrl || '',
        bookingUrl: listing.bookingUrl || '',
        reviewScore: listing.rating || 4.5,
        reviewCount: 0,
    }));

    // Combine all stays - real Airbnb first, then mock data
    const availableStays: StayOption[] = [...realAirbnbStays, ...mockStays];
    const availableActivities = activitiesResults.flat();

    console.log(`✅ Found ${availableStays.length} stays (${realAirbnbStays.length} real Airbnb) and ${availableActivities.length} activities for ${segment.location}`);

    return {
        availableStays: availableStays.sort((a, b) => b.reviewScore - a.reviewScore),
        availableActivities: availableActivities.sort((a, b) => b.rating - a.rating),
    };
}

// ============ Real API Integration - Airbnb Scout ============

import type { TripItem } from '@/types/TripPlan';

/**
 * Airbnb API listing response structure
 */
interface AirbnbApiListing {
    title: string;
    price_total: string;
    rating: number;
    latitude: number;
    longitude: number;
    url: string;
    photos: string[];
    [key: string]: any; // Allow additional properties
}

/**
 * Fetch real Airbnb listings using the Browser Use API
 * 
 * @param destination - The destination city/location
 * @param checkIn - Check-in date in YYYY-MM-DD format
 * @param checkOut - Check-out date in YYYY-MM-DD format
 * @param travelers - Number of travelers/guests
 * @returns Array of TripItem objects representing Airbnb listings
 */
export async function fetchAirbnbListings(
    destination: string,
    checkIn: string,
    checkOut: string,
    travelers: number
): Promise<TripItem[]> {
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Airbnb API fetch');
        return [];
    }

    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/442a08cb-f012-4266-a927-67437632fd1c/execute';

    try {
        console.log(`🏠 Fetching Airbnb listings for ${destination}...`);

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Browser-Use-API-Key': apiKey,
            },
            body: JSON.stringify({
                parameters: {
                    location: destination,
                    checkin: checkIn,
                    checkout: checkOut,
                    guests: travelers,
                },
            }),
        });

        if (!response.ok) {
            console.error(`❌ Airbnb API error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json() as any;
        // Handle nested response: { success: true, result: { success: true, data: { listings: [...] } } }
        const responseData = data.result?.data || data.data || data;
        const listings: AirbnbApiListing[] = responseData.listings || responseData.results || [];

        if (!Array.isArray(listings)) {
            console.warn('⚠️ Unexpected Airbnb API response format:', JSON.stringify(data).substring(0, 200));
            return [];
        }

        console.log(`✅ Received ${listings.length} Airbnb listings`);

        // Map API response to TripItem format
        const tripItems: TripItem[] = listings.map((listing, index) => {
            // Strip non-numeric characters from price (e.g., "$1,234" -> 1234)
            const priceString = listing.price_total || '0';
            const price = parseFloat(priceString.replace(/[^0-9.]/g, '')) || 0;

            return {
                id: `airbnb_listing_${index}_${Date.now()}`,
                type: 'hotel' as const,
                name: listing.title || 'Airbnb Listing',
                price,
                currency: '$',
                coordinates: {
                    lat: listing.latitude || 0,
                    lng: listing.longitude || 0,
                },
                bookingUrl: listing.url || `https://www.airbnb.com/s/${encodeURIComponent(destination)}`,
                provider: 'Airbnb',
                rating: listing.rating || 0,
                imageUrl: listing.photos?.[0] || undefined,
                description: `Airbnb listing in ${destination}`,
                isEstimate: false,
            };
        });

        return tripItems;

    } catch (error) {
        console.error('❌ Error fetching Airbnb listings:', error);
        return [];
    }
}

// ============ Real API Integration - Booking.com Scout ============

/**
 * Booking.com API listing response structure
 */
interface BookingApiListing {
    name: string;
    price: {
        amount: number | string;
        currency?: string;
    };
    review_score: number;
    latitude: number;
    longitude: number;
    photo_url: string;
    url: string;
    property_id: string | number;
    [key: string]: any;
}

/**
 * Fetch real Booking.com hotel listings using the Browser Use API
 * 
 * @param destination - The destination city/location
 * @param checkIn - Check-in date in YYYY-MM-DD format
 * @param checkOut - Check-out date in YYYY-MM-DD format
 * @param travelers - Number of adult travelers/guests
 * @returns Array of TripItem objects representing Booking.com hotels
 */
export async function fetchBookingHotels(
    destination: string,
    checkIn: string,
    checkOut: string,
    travelers: number
): Promise<TripItem[]> {
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Booking.com API fetch');
        return [];
    }

    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/3311e66a-9dc6-403d-93d6-f20e78701bec/execute';
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`🏨 Fetching Booking.com hotels for ${destination}... (attempt ${attempt}/${MAX_RETRIES})`);

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey,
                },
                body: JSON.stringify({
                    parameters: {
                        destination,
                        checkin: checkIn,
                        checkout: checkOut,
                        adults: travelers,
                        rooms: 1,
                        children: 0,
                    },
                }),
            });

            if (!response.ok) {
                console.error(`❌ Booking.com API error: ${response.status} ${response.statusText}`);
                if (attempt < MAX_RETRIES) {
                    console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                return [];
            }

            const data = await response.json() as any;

            // Check for WAF/anti-bot challenge
            if (data.success === false && data.result?.error?.code === 'WAF_CHALLENGE') {
                console.warn(`⚠️ Booking.com WAF challenge detected (attempt ${attempt}/${MAX_RETRIES})`);
                if (attempt < MAX_RETRIES) {
                    console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                console.warn('❌ Max retries reached. Booking.com blocked by AWS WAF.');
                return [];
            }

            // Handle nested response: { success: true, result: { success: true, data: { listings: [...] } } }
            const responseData = data.result?.data || data.data || data;
            const listings: BookingApiListing[] = responseData.listings || responseData.results || responseData.hotels || [];

            if (!Array.isArray(listings)) {
                console.warn('⚠️ Unexpected Booking.com API response format:', JSON.stringify(data).substring(0, 200));
                return [];
            }

            console.log(`✅ Received ${listings.length} Booking.com hotels`);

            // Map API response to TripItem format
            const tripItems: TripItem[] = listings.map((listing) => {
                // Parse price - handle both number and string formats
                let price = 0;
                if (listing.price) {
                    if (typeof listing.price.amount === 'number') {
                        price = listing.price.amount;
                    } else if (typeof listing.price.amount === 'string') {
                        price = parseFloat(listing.price.amount.replace(/[^0-9.]/g, '')) || 0;
                    }
                }

                return {
                    id: `booking-${listing.property_id || Date.now()}`,
                    type: 'hotel' as const,
                    name: listing.name || 'Booking.com Hotel',
                    price,
                    currency: '$',
                    coordinates: {
                        lat: listing.latitude || 0,
                        lng: listing.longitude || 0,
                    },
                    bookingUrl: listing.url || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}`,
                    provider: 'Booking.com',
                    rating: listing.review_score || 0,
                    imageUrl: listing.photo_url || undefined,
                    description: `Booking.com hotel in ${destination}`,
                    isEstimate: false,
                };
            });

            return tripItems;

        } catch (error) {
            console.error(`❌ Error fetching Booking.com hotels (attempt ${attempt}/${MAX_RETRIES}):`, error);
            if (attempt < MAX_RETRIES) {
                console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
            }
            return [];
        }
    }

    return [];
}

// ============ Unified Fetcher - Combined Real API Scout ============

/**
 * Fisher-Yates shuffle algorithm for randomizing array order
 */
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Unified stays fetcher that combines results from multiple real API sources
 * 
 * Uses Promise.allSettled to handle partial failures gracefully - if one API
 * fails, we still return results from the other.
 * 
 * @param destination - The destination city/location
 * @param checkIn - Check-in date in YYYY-MM-DD format
 * @param checkOut - Check-out date in YYYY-MM-DD format
 * @param travelers - Number of travelers/guests
 * @param budget - Optional max price per night to filter results
 * @returns Combined, shuffled array of TripItem objects from all providers
 */
export async function fetchUnifiedStays(
    destination: string,
    checkIn: string,
    checkOut: string,
    travelers: number,
    budget?: number
): Promise<TripItem[]> {
    console.log(`🏠 Fetching unified stays for ${destination} (${checkIn} to ${checkOut})...`);

    // Run both scouts in parallel using Promise.allSettled
    // This ensures one failure doesn't block the other
    const results = await Promise.allSettled([
        fetchAirbnbListings(destination, checkIn, checkOut, travelers),
        fetchBookingHotels(destination, checkIn, checkOut, travelers),
    ]);

    // Extract successful results
    const allStays: TripItem[] = [];

    results.forEach((result, index) => {
        const providerName = index === 0 ? 'Airbnb' : 'Booking.com';

        if (result.status === 'fulfilled') {
            console.log(`✅ ${providerName}: ${result.value.length} listings`);
            allStays.push(...result.value);
        } else {
            console.warn(`⚠️ ${providerName} fetch failed:`, result.reason);
        }
    });

    console.log(`📊 Total stays before filtering: ${allStays.length}`);

    // Apply budget filter if provided
    let filteredStays = allStays;
    if (budget && budget > 0) {
        filteredStays = allStays.filter(stay => stay.price <= budget);
        console.log(`💰 After budget filter ($${budget}/night): ${filteredStays.length} stays`);
    }

    // Shuffle the results so AI sees a mix of providers
    const shuffledStays = shuffleArray(filteredStays);

    console.log(`🔀 Returning ${shuffledStays.length} shuffled stays`);

    return shuffledStays;
}

// ============ Unified Activities Fetcher with Geocoding ============

import { geocodeActivities } from '@/lib/groq';

/**
 * Unified activities fetcher with Google Maps geocoding
 * 
 * This function:
 * 1. Fetches raw activities from Klook and Headout APIs in parallel
 * 2. Heals coordinates using Google Maps Scout for pixel-perfect map pins
 * 3. Returns shuffled activities ready for the curator
 * 
 * @param location - The destination city/location
 * @param date - Optional date for activities (YYYY-MM-DD format)
 * @param budget - Optional max price filter
 * @returns Array of ActivityItem objects with real coordinates
 */
export async function fetchUnifiedActivities(
    location: string,
    date?: string | null,
    budget?: number | null
): Promise<ActivityItem[]> {
    console.log(`🎯 Fetching unified activities for ${location}...`);

    // Step 1: Fetch raw activities from Klook and Headout in parallel
    const [klookItems, headoutItems] = await Promise.all([
        fetchKlookActivities(location, date, budget),
        fetchHeadoutActivities(location),
    ]);

    // Combine all raw activities
    const rawItems = [...klookItems, ...convertHeadoutToActivityItems(headoutItems, location)];

    if (rawItems.length === 0) {
        console.log('⚠️ No activities found, returning empty array');
        return [];
    }

    console.log(`📦 Combined ${klookItems.length} Klook + ${headoutItems.length} Headout = ${rawItems.length} total`);

    // Step 2: Heal coordinates using Google Maps Scout for pixel-perfect pins
    const healedItems = await healCoordinates(rawItems, location);

    // Shuffle to mix providers
    const result = shuffleArray(healedItems);

    console.log(`🔀 Returning ${result.length} activities with healed coordinates`);

    return result;
}

/**
 * Convert Headout TripItems to ActivityItem format
 */
function convertHeadoutToActivityItems(headoutItems: TripItem[], location: string): ActivityItem[] {
    return headoutItems.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || `Headout activity in ${location}`,
        category: 'Tours & Activities',
        provider: 'Headout' as const,
        location: {
            address: location,
            lat: item.coordinates.lat,
            lng: item.coordinates.lng,
        },
        duration: item.duration || 'Varies',
        price: item.price,
        currency: item.currency,
        rating: item.rating || 0,
        reviewCount: 0,
        imageUrl: item.imageUrl || '',
        bookingUrl: item.bookingUrl || '',
        highlights: ['Instant confirmation'],
        bestTimeToVisit: 'All day',
    }));
}

/**
 * Heal coordinates for activities with (0,0) coordinates
 * Uses Google Maps Scout API to get precise real-world coordinates
 * 
 * @param activities - Array of ActivityItem to heal
 * @param locationContext - City/location context for better geocoding (e.g., "Paris")
 * @returns Promise resolving to updated ActivityItem array with healed coordinates
 */
async function healCoordinates(activities: ActivityItem[], locationContext: string): Promise<ActivityItem[]> {
    const BATCH_SIZE = 10; // Safest batch size for the API

    // Filter: Select items with (0,0) coordinates
    const needsGeocoding = activities.filter(
        item => item.location.lat === 0 && item.location.lng === 0
    );

    if (needsGeocoding.length === 0) {
        console.log('✅ All activities already have coordinates');
        return activities;
    }

    console.log(`📍 Healing ${needsGeocoding.length}/${activities.length} activities with missing coordinates...`);

    // Create a mutable copy to apply coordinates
    const healedActivities = [...activities];
    let totalHealed = 0;

    // Chunking: Split items into chunks of 10
    for (let i = 0; i < needsGeocoding.length; i += BATCH_SIZE) {
        const chunk = needsGeocoding.slice(i, i + BATCH_SIZE);
        const chunkNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalChunks = Math.ceil(needsGeocoding.length / BATCH_SIZE);

        console.log(`   📦 Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)...`);

        // Preparation: Create the mapping objects for this chunk
        const batchInput = chunk.map(item => ({
            id: item.id,
            query: `${item.name} ${locationContext}`
        }));

        // Execute: Call batch geocoding for this chunk
        const batchResults = await fetchBatchCoordinates(batchInput);

        // Assign: Loop through and apply the results
        for (const item of chunk) {
            if (batchResults[item.id]) {
                // Find the item in healedActivities and update its coordinates
                const index = healedActivities.findIndex(a => a.id === item.id);
                if (index !== -1) {
                    healedActivities[index] = {
                        ...healedActivities[index],
                        location: {
                            ...healedActivities[index].location,
                            lat: batchResults[item.id].lat,
                            lng: batchResults[item.id].lng,
                        },
                    };
                    totalHealed++;
                }
            }
        }
    }

    console.log(`✅ Healed ${totalHealed}/${needsGeocoding.length} activities with pixel-perfect map coordinates`);

    return healedActivities;
}

// ============ Real API Integration - Headout Scout ============

/**
 * Headout API activity response structure
 */
interface HeadoutApiActivity {
    id: string | number;
    name: string;
    price: number;
    url: string;
    image_url: string;
    rating: number;
    duration: string;
    latitude?: number;
    longitude?: number;
    [key: string]: any;
}

/**
 * Fetch activities from Headout using Browser Use API
 * 
 * @param location - The destination city/location
 * @returns Array of TripItem objects from Headout
 */
export async function fetchHeadoutActivities(
    location: string
): Promise<TripItem[]> {
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Headout API fetch');
        return [];
    }

    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/ab1257b7-f66e-4a29-b2a3-eba52f5b3719/execute';

    try {
        console.log(`🎭 Fetching Headout activities for ${location}...`);

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Browser-Use-API-Key': apiKey,
            },
            body: JSON.stringify({
                parameters: {
                    location,
                    limit: 20,
                    currency: 'USD',
                    sort_type: 'RECOMMENDED',
                },
            }),
        });

        if (!response.ok) {
            console.error(`❌ Headout API error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json() as any;
        // Handle nested response: { success: true, result: { success: true, data: { listings: [...] } } }
        const responseData = data.result?.data || data.data || data;
        const listings: HeadoutApiActivity[] = responseData.listings || responseData.activities || responseData.results || [];

        if (!Array.isArray(listings)) {
            console.warn('⚠️ Unexpected Headout API response format:', JSON.stringify(data).substring(0, 200));
            return [];
        }

        console.log(`✅ Received ${listings.length} Headout activities`);

        // Map API response to TripItem format
        const tripItems: TripItem[] = listings.map((item) => ({
            id: `headout-${item.id || Date.now()}`,
            type: 'activity' as const,
            name: item.name || 'Headout Activity',
            price: typeof item.price === 'number' ? item.price : 0,
            currency: '$',
            coordinates: {
                lat: item.latitude || 0,
                lng: item.longitude || 0,
            },
            bookingUrl: item.url || `https://www.headout.com/search/${encodeURIComponent(location)}`,
            provider: 'Headout',
            rating: item.rating || 0,
            duration: item.duration || 'Varies',
            // Check multiple possible image field names
            imageUrl: item.image_url || item.imageUrl || item.image || item.photo || item.img || item.thumbnail || item.heroImage || undefined,
            description: `Book this activity in ${location} through Headout.`,
            isEstimate: false,
        }));

        return tripItems;

    } catch (error) {
        console.error('❌ Error fetching Headout activities:', error);
        return [];
    }
}

// ============ Google Maps Scout - Exact Coordinates ============

/**
 * In-memory cache for geocoded coordinates to avoid redundant API calls
 */
const geoCache = new Map<string, { lat: number; lng: number }>();

/**
 * Fetch coordinates for multiple locations in a single batch API call
 * 
 * This is much faster than individual calls - one API request for all items.
 * 
 * @param items - Array of { id, query } objects to geocode
 * @returns Record mapping item IDs to their coordinates
 */
async function fetchBatchCoordinates(
    items: { id: string; query: string }[]
): Promise<Record<string, { lat: number; lng: number }>> {
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping batch geocoding');
        return {};
    }

    if (items.length === 0) {
        return {};
    }

    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/da022610-68fd-443f-a856-a109dc7b8243/execute';

    try {
        console.log(`🗺️ Batch geocoding ${items.length} locations in single API call...`);

        // Construct payload with the exact nested structure required
        const payload = {
            parameters: {
                parameter: {
                    locations: items.map(i => i.query) // Send just the array of strings
                }
            }
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Browser-Use-API-Key': apiKey,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`❌ Batch geocoding API error: ${response.status} ${response.statusText}`);
            return {};
        }

        const json = await response.json() as any;

        // Access the nested data object
        const data = json.result?.data || {};

        const resultMap: Record<string, { lat: number; lng: number }> = {};

        // Map results back to IDs using the query as the key
        items.forEach(item => {
            const coords = data[item.query];
            if (coords && coords.latitude && coords.longitude) {
                resultMap[item.id] = { lat: coords.latitude, lng: coords.longitude };
                // Also cache the result for future lookups
                geoCache.set(item.query, { lat: coords.latitude, lng: coords.longitude });
            }
        });

        console.log(`✅ Batch geocoded ${Object.keys(resultMap).length}/${items.length} locations`);

        return resultMap;

    } catch (error) {
        console.error('❌ Error in batch geocoding:', error);
        return {};
    }
}

/**
 * Normalize a query by removing common booking-related suffixes
 * that might confuse geocoding services
 */
function normalizeGeoQuery(query: string): string {
    const suffixesToRemove = [
        'Ticket',
        'Tickets',
        'Tour',
        'Tours',
        'Pass',
        'Entry',
        'Admission',
        'Experience',
        'Booking',
        'Reservation',
        'Skip the Line',
        'Skip-the-Line',
        'Fast Track',
        'Priority Access',
        'Guided',
        'Self-Guided',
        'Day Trip',
        'Half Day',
        'Full Day',
        'Private',
        'Group',
    ];

    let normalized = query;

    // Remove suffixes (case-insensitive)
    for (const suffix of suffixesToRemove) {
        const regex = new RegExp(`\\s*${suffix}\\s*`, 'gi');
        normalized = normalized.replace(regex, ' ');
    }

    // Clean up extra whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Extract a simpler location name from a query for fallback geocoding
 * e.g., "The Louvre Museum Paris" -> "Louvre, Paris"
 */
function simplifyQuery(query: string, locationContext: string): string {
    // If the query already ends with the location context, extract the key part
    const words = normalizeGeoQuery(query).split(' ');

    // Filter out common filler words
    const fillerWords = ['the', 'a', 'an', 'to', 'at', 'in', 'of', 'with', 'for'];
    const significant = words.filter(w =>
        w.length > 2 && !fillerWords.includes(w.toLowerCase())
    );

    // Take first 2-3 significant words and add location context
    const simpleName = significant.slice(0, 3).join(' ');

    // Append location context if not already present
    if (simpleName.toLowerCase().includes(locationContext.toLowerCase())) {
        return simpleName;
    }

    return `${simpleName}, ${locationContext}`;
}

/**
 * Core function to call the Google Maps Scout API
 */
async function callGoogleMapsScout(
    query: string,
    apiKey: string
): Promise<{ lat: number; lng: number } | null> {
    const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/da022610-68fd-443f-a856-a109dc7b8243/execute';

    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Browser-Use-API-Key': apiKey,
        },
        body: JSON.stringify({
            parameters: {
                query,
            },
        }),
    });

    if (!response.ok) {
        console.error(`❌ Google Maps API error: ${response.status} ${response.statusText}`);
        return null;
    }

    const data = await response.json() as any;

    // Handle nested response structure
    const result = data.result?.data || data.data || data.result || data;

    // Check for explicit error responses
    if (result.error || result.success === false) {
        console.warn(`⚠️ API returned error for: ${query}`, result.error || result);
        return null;
    }

    // Extract coordinates - handle various response formats
    let lat = result.lat ?? result.latitude ?? result.location?.lat ??
        result.coordinates?.lat ?? result.geometry?.location?.lat ?? null;
    let lng = result.lng ?? result.longitude ?? result.lon ??
        result.location?.lng ?? result.coordinates?.lng ??
        result.geometry?.location?.lng ?? null;

    // Also try parsing from a string coordinates field
    if ((lat === null || lng === null) && typeof result.coordinates === 'string') {
        const match = result.coordinates.match(/([-\d.]+),\s*([-\d.]+)/);
        if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
        }
    }

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return null;
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn(`⚠️ Coordinates out of range for: ${query} (${lat}, ${lng})`);
        return null;
    }

    return { lat, lng };
}

/**
 * Fetch exact coordinates for a location query using Google Maps Scout
 * 
 * Uses Browser Use API to get precise coordinates from Google Maps.
 * Results are cached in memory to avoid redundant lookups.
 * Includes automatic query normalization and retry logic for better results.
 * 
 * @param query - The search query (e.g., "Eiffel Tower, Paris" or activity name)
 * @param locationContext - Optional location context for fallback queries
 * @returns Promise resolving to { lat, lng } or null if failed
 */
export async function fetchExactCoordinates(
    query: string,
    locationContext?: string
): Promise<{ lat: number; lng: number } | null> {
    // Check cache first (for original query)
    if (geoCache.has(query)) {
        console.log(`📍 Cache hit for: ${query}`);
        return geoCache.get(query)!;
    }

    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Google Maps lookup');
        return null;
    }

    try {
        // Step 1: Try with normalized query (removes "Ticket", "Tour", etc.)
        const normalizedQuery = normalizeGeoQuery(query);
        console.log(`🗺️ Fetching coordinates for: ${query}`);

        if (normalizedQuery !== query) {
            console.log(`   📝 Normalized to: ${normalizedQuery}`);
        }

        let coords = await callGoogleMapsScout(normalizedQuery, apiKey);

        // Step 2: If first attempt failed and we have location context, try simplified query
        if (!coords && locationContext) {
            const simplifiedQuery = simplifyQuery(query, locationContext);
            console.log(`   🔄 Retrying with simplified query: ${simplifiedQuery}`);
            coords = await callGoogleMapsScout(simplifiedQuery, apiKey);
        }

        // Step 3: If still failed, try just the location context as last resort
        if (!coords && locationContext) {
            console.log(`   🔄 Last resort: using location context: ${locationContext}`);
            coords = await callGoogleMapsScout(locationContext, apiKey);
        }

        if (coords) {
            // Store in cache (for original query to avoid re-processing)
            geoCache.set(query, coords);
            console.log(`✅ Geocoded: ${query} → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
            return coords;
        }

        console.warn(`⚠️ Could not geocode: ${query}`);
        return null;

    } catch (error) {
        console.error(`❌ Error fetching coordinates for ${query}:`, error);
        return null;
    }
}

/**
 * Clear the geocoding cache (useful for testing or memory management)
 */
export function clearGeoCache(): void {
    geoCache.clear();
    console.log('🧹 Geo cache cleared');
}

/**
 * Get current cache size
 */
export function getGeoCacheSize(): number {
    return geoCache.size;
}
