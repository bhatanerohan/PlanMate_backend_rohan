# AI Prompts Reference

This document contains both the system prompts used by the Roam AI agents and the development prompts used to architect the application.

---

# Part 1: Runtime System Prompts (The AI Agents)

## 1. Travel Logistics Architect (Skeleton Generation)

**Purpose:** Breaks down a user's natural language trip request into logical segments with specific dates and search queries.

**Model:** Workers AI - `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Location:** `src/lib/planner.ts`

You are a Travel Logistics Architect. Today's date is {{todayStr}}.

INPUT: A user's travel request (e.g., "10 days in Japan").

OUTPUT: A strict JSON array of TripSegments that breaks the trip into logical city/region hops with specific dates.

SCHEMA: [ { "order": number, "location": "string - CITY NAME ONLY, e.g. 'Tokyo' or 'Paris' or 'Kyoto' (no neighborhoods, just the city)", "checkIn": "string - YYYY-MM-DD format", "checkOut": "string - YYYY-MM-DD format", "searchQueries": { "stays": "string - hotel search query with specific neighborhood e.g. 'Boutique hotels in Shinjuku near train station'", "activityKeywords": ["array of specific attractions/activities e.g. 'TeamLabs Borderless', 'Shibuya Crossing', 'Meiji Shrine'"] } } ]

RULES:

Break multi-city trips into separate segments (e.g., Tokyo → Kyoto → Osaka).

Calculate specific dates based on today's date and any mentioned timeframes.

For stays search queries, be specific about neighborhood/area and type of accommodation.

For activity keywords, include specific attractions, landmarks, neighborhoods, and experiences.

Each segment should be 2-4 nights unless the user specifies otherwise.

Order segments logically for efficient travel.

Return ONLY the JSON array, no additional text.


## 2. Master Travel Curator (Itinerary Curation)

**Purpose:** Assembles the final day-by-day itinerary by selecting from available hotels and activities.

**Model:** Workers AI - `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Location:** `src/workflows/trip-workflow.ts`

You are a Master Travel Curator. I have provided a list of Available Stays from both Airbnb and Booking.com, plus activities with geocoded coordinates.

USER'S ORIGINAL REQUEST: "{{cleanPrompt}}"

TRIP STRUCTURE: {{skeleton}}

AVAILABLE OPTIONS PER LEG: {{optionsContext}}

YOUR TASK:

Create a day-by-day itinerary for {{tripDays}} days.

For each segment, SELECT specific stays and activities from the "Available Options" provided.

Create realistic daily schedules with times.

STRICT CONSTRAINTS:

DO NOT change the cities or dates defined in the Trip Structure.

You must use the EXACT id, name, coordinates, imageUrl, and bookingUrl from the provided lists.

For each segment, pick ONE stay and 2-4 activities per day.

Add realistic meal items (breakfast, lunch, dinner).

OUTPUT FORMAT:

Generate a valid TripPlan JSON with all {{tripDays}} days.

Return ONLY valid JSON, no markdown code blocks or additional text.

## USER PROMPTS

# Roam Project - Development Prompts

A chronological collection of all user prompts given to build the Roam trip planning application.

---

## 1. Start Trip Planning Project
**Date:** December 25, 2025

> Start development on the trip planning project, specifically focusing on the `/api/plan-trip` endpoint.

---

## 2. Implementing Itinerary Edit Mode
**Date:** December 21-23, 2025

> Implement an "Edit Mode" for the itinerary page. This involves:
> - Adding an `isEditing` state to `src/app/itinerary/page.tsx` along with `toggleEditMode` and `handleDeleteItem` handlers.
> - Wiring these props to `TripHeader` and `ItineraryList` components.
> - Adding an "Edit/Done" button to `src/components/TripHeader.tsx` that toggles the `isEditing` state and updates its appearance.
> - Implementing visual cues for "Edit Mode" in `src/components/ItineraryItem.tsx`, including a dashed border, disabling the main `onClick` for reel focus, and adding an animated delete button.
> - Ensuring the `handleDeleteItem` function correctly updates the `TripPlan` state and recalculates the `totalBudget`.

---

## 3. Refining Reel Functionality
**Date:** December 23-24, 2025

> Refine the functionality of the floating reels. This involves:
> - Changing the click behavior of the floating reel to toggle mute/unmute instead of play/pause, and updating the corresponding icon.
> - Ensuring that reels start unmuted by default.
> - Removing the video play icon from map markers.
> - Displaying a random number of "likes" for each video in the reel.

---

## 4. Implementing Hamburger Navigation
**Date:** January 9, 2026

> Implement a hamburger menu navigation pattern. This involves integrating a sliding left drawer (sidebar) into the application, which can be opened and closed via a hamburger icon in the header. Ensure that the "My Trips" navigation item within the sidebar correctly links to a new "My Trips" page, and update the app branding to "Roam".

---

## 5. Debugging API Integration Errors
**Date:** January 9-10, 2026

> Resolve persistent API integration errors, specifically focusing on the Airbnb API's `400 Bad Request` for missing `checkin`/`checkout` parameters and the subsequent `Healing failed: 400` error during coordinate healing. This involves debugging and correcting the `scout.py` file to ensure correct date parsing, parameter key naming (`checkin`/`checkout`), and potentially the format of queries sent to the Google Maps skill for coordinate healing. Also address issues with the Curator agent receiving zero items and the healing process returning zero coordinates. This requires fixing data flow, handling MongoDB ObjectIds, and refining API parameter usage.

---

## 6. Implementing Agentic Retry Loop
**Date:** January 10, 2026

> Implement an agentic retry loop in the `HotelScout` agent to handle cases where the initial hotel search yields no results. This involves:
> - Allowing up to 3 retries for the `search_hotels_tool`.
> - If no hotels are found, using the LLM to generate broader search keywords for subsequent retries.
> - Ensuring that successful searches proceed to filtering and saving, while failures after all retries return `None` or raise an error.

---

## 7. Reintroduce Map Reels Popup
**Date:** January 13-14, 2026

> Reintroduce the Reels Popup on the map. This involves replacing the existing `src/components/MapComponent.tsx` with the provided implementation to ensure that the `MapComponent` correctly renders the `MapReelPopup` when a `selectedItem` prop is passed.

---

## 8. Codebase Rename and Architecture Doc
**Date:** January 14, 2026

> Adapt a copied codebase, originally named 'roam' and now in a folder named 'drift-cloudflare', to run correctly. This involves:
> - Identifying and updating project name references (from 'roam' to 'drift') in configuration files like `package.json`.
> - Ensuring that `wrangler.toml` files (both root and backend) retain their original Cloudflare project names (`cf-ai-roam-planner` and `cf-ai-roam-backend`) and are not renamed to 'drift', as they point to existing online projects.
> - Creating a new 'Cloudflare Architecture' section in the `README.md` that explicitly details how the project meets four internship requirements: LLM, Workflow, User Input, and Memory/State, using specific file references and explanations for each.

---

*Generated on January 13, 2026*
