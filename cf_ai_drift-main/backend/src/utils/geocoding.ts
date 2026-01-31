
export const destinationCoords: Record<string, { lat: number; lng: number; timezone: string }> = {
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

export function getDestinationCoords(destination: string): { lat: number; lng: number } {
    const key = destination.toLowerCase();
    for (const [name, coords] of Object.entries(destinationCoords)) {
        if (key.includes(name) || name.includes(key)) {
            return { lat: coords.lat, lng: coords.lng };
        }
    }
    return { lat: destinationCoords.default.lat, lng: destinationCoords.default.lng };
}

export function randomOffset(base: number, range: number = 0.05): number {
    return base + (Math.random() - 0.5) * range * 2;
}
