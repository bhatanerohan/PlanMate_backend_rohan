# 🗺️ PlanMate - AI-Powered Itinerary Planning Agent

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> An intelligent AI agent system that creates personalized itineraries and discovers venues using multi-agent architecture, Google Gemini grounding, and ReAct pattern.

---

## ✨ Features

### 🤖 **Multi-Agent Architecture**
- **ReAct Agent Pattern** - Reasoning + Acting cycle for intelligent decision-making
- **Gemini Grounding Agent** - Real-time venue discovery with Google Maps integration
- **Plan Creator Agent** - Contextual itinerary generation with pattern matching
- **Query Classifier** - Smart intent detection and routing

### 🎯 **Core Capabilities**
- ✅ Natural language itinerary planning ("plan a romantic date night in Boston")
- ✅ Venue discovery with real-time data from Google Places API
- ✅ Route optimization and travel time calculation
- ✅ Alternative venue suggestions with geographic optimization
- ✅ Dynamic itinerary modifications ("replace stop 2 with a pizza place")
- ✅ Event integration and availability validation
- ✅ Interactive map visualization with Mapbox

### 🛠️ **Advanced Features**
- **3-Tier Progressive Search** - Smart radius expansion (1 mile → 5 miles → city-wide)
- **Batch Venue Search** - Parallel API calls for faster results
- **Geographic Optimization** - Location-aware venue clustering
- **Alternative Venues Map** - Multiple options for each stop
- **Safety Controls** - Token limits, iteration caps, and repetition detection

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Chat UI     │  │   Map View   │  │ Message List │     │
│  │              │  │  (Mapbox GL) │  │ w/ Venues &  │     │
│  │              │  │              │  │   Events     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Express + TypeScript)              │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             🧠 ReAct Agent System                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │  Think   │→ │   Act    │→ │ Observe  │ (Loop)     │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  └───────────────────────────────────────────────────────┘  │
│                            ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              🔧 Tool Registry                          │  │
│  │  • search_venues      • calculate_route               │  │
│  │  • batch_search       • validate_availability         │  │
│  │  • search_events      • finish                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                            ↓                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Gemini     │  │    Google    │  │    OpenAI    │      │
│  │  Grounding   │  │  Places API  │  │   GPT-4o     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/planmate-ai-agent.git
cd planmate-ai-agent
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Configure environment variables**

Create `.env` in the backend directory:
```env
# Required API Keys
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
GOOGLE_CLIENT_ID=your_google_web_client_id_here

# Optional API Keys
YOUTUBE_API_KEY=your_youtube_api_key_here          # For video enrichment
TICKETMASTER_API_KEY=your_ticketmaster_api_key     # For event search

# Feature Flags
ENABLE_YOUTUBE_ENRICHMENT=false                     # Set to 'true' to enable video enrichment

# Server Configuration
PORT=3001
NODE_ENV=development
AUTH_SESSION_TTL_DAYS=30
```

Create `.env` in the frontend directory:
```env
VITE_API_URL=http://localhost:3001
VITE_MAPBOX_TOKEN=your_mapbox_token_here
VITE_GOOGLE_CLIENT_ID=your_google_web_client_id_here
```

4. **Start the application**

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

5. **Open your browser**
```
http://localhost:5173
```

---

## 🚫 Disabled & Test Files

### Currently Disabled Features
These files exist in the codebase but are **not active** in production:

**YouTube Video Enrichment** (Disabled)
- `youtube.ts` - Stub implementation returning empty arrays
- `video-enrichment-agent.ts` - Bypasses video enrichment
- **Why disabled?** Optional feature that can be enabled by setting `ENABLE_YOUTUBE_ENRICHMENT=true` in `.env`
- **To enable:** Add `YOUTUBE_API_KEY=your_key` and `ENABLE_YOUTUBE_ENRICHMENT=true` to backend `.env`

### Test Files
Located in `backend/tests/` - used for development and testing only:
- `test-classifier.ts` - Tests query classification logic
- `test-single.ts` - Tests single venue search
- `test-react-agent.ts` - Tests ReAct agent loop
- `test-agent-single.ts` - Tests complete agent workflow

**Run tests:**
```bash
npm run test:classifier  # Test query classification
npm run test:single      # Test venue search
npm run test:react       # Test ReAct agent
npm run test:agent       # Test full workflow
```

### Commented Code
`react-agent.ts` contains large blocks of commented legacy code from previous implementations. These are kept for reference but are not executed.

### Auto-Generated Directories
- `backend/outputs/` - Created automatically when logging is enabled. Contains execution logs and should be added to `.gitignore`

---

## 📖 Usage Examples

### Natural Language Planning
```
User: "Plan a romantic date night in Boston"

Agent: 
✅ Searches for romantic venues (restaurants, bars, scenic spots)
✅ Creates 3-stop itinerary with optimal route
✅ Provides alternatives for each venue
✅ Calculates travel times and distances
```

### Dynamic Modifications
```
User: "Replace stop 2 with an Italian restaurant"

Agent:
✅ Identifies stop 2
✅ Searches for Italian restaurants nearby
✅ Updates route calculations
✅ Preserves other stops
```

### Discovery Mode
```
User: "Show me the best coffee shops in Cambridge"

Agent:
✅ Returns top-rated venues
✅ No route calculation
✅ Provides photos and descriptions
✅ Shows alternatives
```

---

## 🧪 Testing

Run individual component tests:

```bash
# Test query classifier
npm run test:classifier

# Test single venue search
npm run test:single

# Test ReAct agent
npm run test:react

# Test complete agent flow
npm run test:agent
```

---

## 📁 Project Structure

```
planmate-ai-agent/
├── backend/
│   ├── agents/
│   │   ├── react-agent.ts           # Main ReAct agent loop
│   │   ├── gemini-grounding-agent.ts # Gemini + Maps integration
│   │   ├── plan-creator-agent.ts    # Itinerary pattern generator
│   │   ├── modification-agent.ts    # Itinerary modification handler
│   │   └── query-classifier.ts      # Intent detection & routing
│   ├── services/
│   │   ├── api-clients/
│   │   │   ├── google-places.ts     # Places API client
│   │   │   ├── openai-client.ts     # GPT-4 client
│   │   │   ├── mapbox.ts            # Mapbox routing client
│   │   │   ├── ticketmaster.ts      # Event search client
│   │   │   ├── ❌ youtube.ts        # DISABLED: Video enrichment stub
│   │   │   └── ❌ video-enrichment-agent.ts  # DISABLED: Returns unmodified venues
│   │   ├── tools/
│   │   │   ├── venue-search.ts      # Venue search tool
│   │   │   ├── batch-search.ts      # Parallel search tool
│   │   │   ├── route-calculator.ts  # Route optimization
│   │   │   ├── base-tool.ts         # Tool base class
│   │   │   └── tool-registry.ts     # Central tool management
│   │   ├── safety-guards.ts         # Agent safety & limits
│   │   ├── route-evaluator.ts       # Route validation logic
│   │   ├── logger.ts                # Console capture utility
│   │   └── output-logger.ts         # File output logger
│   ├── types/
│   │   ├── react-agent.ts           # Agent type definitions
│   │   └── tools.ts                 # Tool interfaces
│   ├── tests/                       # ⚠️ TEST FILES (not in production)
│   │   ├── test-classifier.ts       # Query classifier tests
│   │   ├── test-single.ts           # Single venue search tests
│   │   ├── test-react-agent.ts      # ReAct agent tests
│   │   └── test-agent-single.ts     # Agent flow tests
│   ├── outputs/                     # 📁 AUTO-GENERATED (logs, gitignored)
│   ├── server.ts                    # Express server
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx    # Main chat UI
│   │   │   ├── MapView.tsx          # Mapbox integration
│   │   │   └── MessageList.tsx      # Message & venue display
│   │   ├── services/
│   │   │   └── api.ts               # API client
│   │   ├── types/
│   │   │   └── index.ts             # Frontend type definitions
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
└── README.md
```

---

## 🎯 Agile Development Roadmap

### ✅ Phase 1: Core Infrastructure (Completed)
- [x] ReAct agent architecture
- [x] Tool registry system
- [x] Google Places integration
- [x] Basic venue search

### ✅ Phase 2: Intelligence Layer (Completed)
- [x] Gemini grounding agent
- [x] Query classification
- [x] Pattern-based plan creation
- [x] Alternative venue system

### 🚧 Phase 3: Route Optimization (Current)
- [x] Route calculation tool
- [x] Geographic optimization
- [x] Travel time estimation
- [ ] Multi-modal transport options

### 📋 Phase 4: Enhanced Features (Next)
- [ ] User preferences memory
- [ ] Budget constraints
- [ ] Time-based filtering
- [ ] Weather integration
- [ ] Dietary restrictions handling

### 🔮 Phase 5: Advanced Intelligence (Future)
- [ ] Multi-day itineraries
- [ ] Group planning
- [ ] Real-time adjustments
- [ ] Collaborative planning
- [ ] Social features

---

## 🔧 Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.9
- **Framework**: Express.js
- **AI Models**: 
  - OpenAI GPT-4o (reasoning)
  - Google Gemini Pro (grounding)
- **APIs**: 
  - Google Places API
  - Google Maps API
  - Mapbox API

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Maps**: Mapbox GL JS
- **State Management**: React Hooks
- **Deployment**: Vercel

### Deployment
- **Frontend**: Deployed on [Vercel](https://vercel.com)
- **Backend**: Deployed on [Railway](https://railway.app)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- OpenAI for GPT-4o
- Google for Gemini and Places API
- Mapbox for mapping services
- Anthropic for ReAct pattern inspiration

---

## 📬 Contact

- **Issues**: [GitHub Issues](https://github.com/yourusername/planmate-ai-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/planmate-ai-agent/discussions)

---

<div align="center">

**Built with ❤️ using AI Agents**

⭐ Star this repo if you find it helpful!

</div>
