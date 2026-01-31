This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Video Demo

https://github.com/user-attachments/assets/a571a785-90de-41f6-bea7-71a12df5e027

## Try it Live

🌍 **[Try the app here](https://cf-ai-roam-planner.pages.dev/)**

**Sample query:** *Plan me a 5 day trip to Italy under 2k focusing on art.*

## Getting Started
### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers & Pages enabled.

### Installation
1.  **Install Root Dependencies** (Frontend):
    ```bash
    npm install
    ```
2.  **Install Backend Dependencies**:
    ```bash
    cd backend
    npm install
    ```

### Backend Deployment
The backend worker handles the AI logic and workflows. You must deploy it first so the frontend has a binding to connect to.
```bash
cd backend
npx wrangler deploy
```
*Note: This will create the `drift-backend` worker and the necessary KV/Workflow bindings on your Cloudflare account.*

### Run Frontend
Start the Next.js development server locally. It is configured to connect to your deployed backend.
```bash
# Return to root directory
cd ..
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to start planning your trip.

## Cloudflare Architecture
This project is built to run on Cloudflare's edge infrastructure.
### 1. LLM
I use `llama-3.3-70b` as the core intelligence for the application, specifically in `backend/src/trip-workflow.ts` and `src/lib/planner.ts`.
- **Primary Intelligence**: The Llama 3.3 70B model is invoked via Cloudflare Workers AI to handle complex tasks like itinerary curation and skeleton generation.
- **Helper Model**: I also utilize Groq as a helper model for initial fast skeleton generation, orchestrating a multi-model approach.

### 2. Workflow
The application uses **Cloudflare Workflows** to manage the long-running trip generation process.
- **Implementation**: `TripWorkflow` in `backend/src/trip-workflow.ts` orchestrates the entire durable execution.
- **Steps**: The workflow is broken down into 4 atomic, retriable steps:
  1.  `generate-skeleton`
  2.  `fetch-options`
  3.  `curate-itinerary`
  4.  `save-state`

### 3. User Input
User interaction is handled via a **Next.js** frontend deployed on **Cloudflare Pages**.
- **Process**: The frontend captures user prompts and sends them to `src/app/api/plan-trip/route.ts`.
- **Trigger**: This API route then triggers the `TripWorkflow` instance, passing the user's input to start the durable execution on the backend.

### 4. Memory/State
State management and persistence are handled using **Cloudflare KV**.
- **Persistence**: The `TRIP_CACHE` KV namespace is defined in `backend/wrangler.toml` and is used to durably store the final trip plans.
- **Retrieval**: The frontend asynchronously retrieves the generated plan by polling `src/app/api/poll-trip/route.ts`, which checks the KV store for the completed result.

## How it Works

The core logic resides in `backend/src/trip-workflow.ts`, which orchestrates a valid, bookable itinerary through a multi-stage workflow:

### 1. Skeleton Generation (Step 1)
The workflow parses the user's natural language request (e.g., "10 days in Japan") to generate a **Trip Skeleton**.
This acts as the structural foundation, breaking the trip into logical city segments (e.g., Tokyo -> Kyoto -> Osaka) with calculated dates. It validates the timeline to ensure the trip is logistically sound before any bookings are looked up.

### 2. Parallel Data Fetching (Step 2)
Once the skeleton is set, the workflow enters the `fetch-options` phase. It executes a **Parallel Search strategy** using `Promise.allSettled` to query multiple providers simultaneously without blocking:
- **Accommodation**: Fetches real placements from **Airbnb** and **Booking.com**.
- **Activities**: Retrieves real-time availability from **Klook** and **Headout**.
- **Geocoding**: Resolves coordinates for all items to ensure they can be placed accurately on the map.

### 3. AI Curation (Step 3)
In the final `curate-itinerary` step, the LLM assumes the role of a "**Master Travel Curator**".
It consumes the verified data from Step 2 and the constraints from Step 1. Using a monolithic prompt strategy, it intelligently selects the best combination of hotels and activities for each day, enforcing logic like:
- "Check-in" acts as the first item upon arrival in a new city.
- No duplicate activities across days.
- Logical sequencing of events (morning/afternoon/evening).
The result is a final, highly structured JSON object that is ready for the frontend.

## Deploy on Cloudflare

```bash
# Build for Cloudflare Pages
npm run build:cloudflare

# Preview locally
npm run preview

# Deploy (requires wrangler login)
wrangler pages deploy .vercel/output/static
```
