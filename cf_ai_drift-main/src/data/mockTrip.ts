import { TripPlan } from '@/types/TripPlan';

export const mockTrip: TripPlan = {
    id: 'trip-1',
    destination: 'Tokyo',
    // Wait, prompt says: "Mock Data: Create a file mockTrip.ts with hardcoded data for a '3-Day Trip to Tokyo' that matches this interface."
    // I will make it "3-Day Trip to Tokyo" as requested.
    dates: 'Oct 14 - Oct 17',
    totalBudget: 1450,
    currency: '$',
    travelers: 2,
    days: [
        {
            id: 'day-1',
            date: '2023-10-14',
            title: 'Arrival & Check-in',
            subtitle: 'Monday, October 14th',
            items: [
                {
                    id: 'flight-1',
                    type: 'flight',
                    name: 'Flight Arrival: NRT Terminal 1',
                    price: 0,
                    currency: '$',
                    coordinates: { lat: 35.7719867, lng: 140.3906561 },
                    time: '14:30',
                    description: 'Flight JL005 from San Francisco',
                },
                {
                    id: 'train-1',
                    type: 'train',
                    name: "Narita Express (N'EX)",
                    price: 28,
                    currency: '$',
                    coordinates: { lat: 35.681236, lng: 139.767125 },
                    time: '15:45',
                    duration: '50m',
                    provider: 'JR East',
                    metadata: {
                        platform: 'Platform 2',
                        seat: 'Reserved Seat 4A',
                    },
                },
                {
                    id: 'hotel-1',
                    type: 'hotel',
                    name: 'Hyatt Regency Tokyo',
                    price: 245,
                    currency: '$',
                    coordinates: { lat: 35.6905, lng: 139.6917 }, // Shinjuku
                    bookingUrl: 'https://booking.com',
                    provider: 'Booking.com',
                    rating: 4.5,
                    description: 'Luxury hotel in the heart of Shinjuku. Close to major transit hubs and shopping districts.',
                    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBGMpyhnEmhtAf2zs7v0wNwLg0i2xIjdRqaj7c2bP2q4Jitu_T1uiX2enmiKMSV2ZR4By3kdSZ3IQ3bPJexOeu-i9H02B_NRwcSBjOdVJWjxNmwma9qr1mBP7R6NMio-kcBto7EpFNR9SVi6YfJFXG84dM0hnFoObdd_XvqZvHskihDVQaAf0mKME85V3ZMODDlMo3tNKLL15P1lTb9ORqtML1rpUJZK_w9w41iYxSuR6S0LjZs7C3-w2IPdyyAgTM4SUDfNri-tePg',
                    isEstimate: true
                },
                {
                    id: 'activity-1',
                    type: 'activity',
                    name: 'Evening Guided Walk in Shinjuku',
                    price: 45,
                    currency: '$',
                    coordinates: { lat: 35.6938, lng: 139.7034 },
                    time: '19:00',
                    bookingUrl: 'https://www.viator.com',
                    provider: 'Viator',
                    description: 'Explore neon lights and hidden alleys with a local guide.',
                    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsC0rW4Bujs7fNpjfoGDincCRkiy0xt7cqRoveX8RLi75aCeHZh2NJrpKJscqf_dJXDbzNbaMt_Ctaq_0sD63tga-GSgn5M1jO-SzUcU-6S0RW50NMPdXhaTh2cyX5VJe0olxyj740nx4ORQ69Ty2VxMOmAIJ1Y-FA6nkgP1XhVqXrjmZ9ef9uoYPLdHyCxiPng_HBqDaMDVaKegz_0TgOGRjSFw9fbVoAR7k3VzNWUzVFsx6wXvkRiIc31fN2PzgxC7SaiOFo3hIo'
                },
            ],
        },
        {
            id: 'day-2',
            date: '2023-10-15',
            title: 'Modern vs Traditional',
            subtitle: 'Tuesday, October 15th',
            items: [
                {
                    id: 'food-1',
                    type: 'food',
                    name: "Breakfast at Sarabeth's",
                    price: 25,
                    currency: '$',
                    coordinates: { lat: 35.690, lng: 139.695 },
                    time: '09:00',
                    description: '"Queen of Breakfast in New York" - Tokyo Branch',
                },
                {
                    id: 'activity-2',
                    type: 'activity',
                    name: 'teamLab Planets TOKYO',
                    price: 38,
                    currency: '$',
                    coordinates: { lat: 35.6154, lng: 139.7941 },
                    time: '11:00',
                    bookingUrl: 'https://airbnb.com',
                    provider: 'Airbnb',
                    description: 'Body Immersive art exhibition. Walk through water.',
                    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhIiC0qJi5UtCjo2ek9oCyGTM_q66jHrZIReuafdKqUs8OyTN-dRMrEveEbeztMHffVU2WfPpcbmSs7FgmZCEtfaE5tyskL9Se8zYb1w-kB75vVxsg5fjBAJMfudhbePghRc_puK90s8FxzmzlN8GpApq1YEPOgQ9xslgsrueU-8WmLvfk4uzYsm53MkLSNJTd39reBhekwffvRPCKn8V7pOVFe2bj2HcH8i1DA5rxR4mfSk0y8g5L2WuDGrqbFUBCloVC9DYOJYJv'
                },
            ],
        },
        {
            id: 'day-3',
            date: '2023-10-16',
            title: 'Historical Asakusa',
            subtitle: 'Wednesday, October 16th',
            items: [],
        }
    ],
};
