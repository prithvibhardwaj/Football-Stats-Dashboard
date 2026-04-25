# Football Analytics Dashboard

Full-stack football analytics dashboard built with React, FastAPI, Supabase, Redis, and SQLAlchemy-backed storage. The app centers on a user's three pinned teams and surfaces live match tracking, replay, referee analysis, injury tracking, league hubs, and score predictions without ever exposing the API-Football key to the browser.

## Architecture

```mermaid
flowchart LR
  A["React + Vite Frontend"] --> B["FastAPI Backend"]
  A --> C["Supabase Auth"]
  C --> D["Supabase Tables<br/>user_teams<br/>user_preferences"]
  B --> E["Redis Cache + Daily Budget Counter"]
  B --> F["Persistent Database<br/>Postgres recommended<br/>matches<br/>events<br/>predictions<br/>model_artifacts"]
  B --> G["API-Football"]
  B --> H["Weekly Poisson Retraining"]
  H --> F
```

## Stack

- Frontend: React, Vite, Tailwind CSS, shadcn/ui foundation, Framer Motion, Recharts, D3, Zustand, React Router v6, MSW
- Backend: FastAPI, Uvicorn, Redis, SQLAlchemy, Postgres recommended for deployment
- Auth and user storage: Supabase Auth plus `user_teams` and `user_preferences`
- ML: feature engineering plus Poisson-style score prediction pipeline stored in the backend database
- Deployment targets: Vercel for frontend, Railway for backend and Redis, Supabase hosted

## Project Structure

```text
football-dashboard/
|-- frontend/
|-- backend/
|-- supabase/
`-- README.md
```

The frontend and backend directories follow the exact feature structure requested in the build spec, including reusable pitch/chart components, API routers, ML modules, and Supabase schema SQL.

## Features Delivered

- Email/password authentication with Supabase
- Protected routing with onboarding redirect logic
- Three-team onboarding flow with derived league preferences
- Persistent team switcher in the top navbar
- Dashboard with pinned team summaries, predictions, live match cards, injury counts, and referee insights
- League hubs with standings, fixture lists, top scorers/assisters, radar comparison, and form heatmaps
- Match pages with live tracker, momentum bar, prediction panels, injury tracker, and referee analysis
- Historical replay with scrubber, animated ball movement, and event log
- Player comparison with persisted Zustand state
- Referee analysis endpoint and page backed by cached historical calculations
- Injury tracker integrated into dashboard, team page, and pre-match match view
- Prediction backend and UI for upcoming fixtures

## Setup

### 1. Supabase

Run the SQL in [supabase/schema.sql](C:\Users\prith\Football Statistics Dashboard\supabase\schema.sql) inside your Supabase SQL editor. It creates:

- `user_teams`
- `user_preferences`
- row-level security policies so users can only read and write their own rows

### 2. Backend

Create `backend/.env` from [backend/.env.example](C:\Users\prith\Football Statistics Dashboard\backend\.env.example).

Required variables:

```env
API_FOOTBALL_KEY=
REDIS_URL=
# Optional for future backend-side Supabase admin actions
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/football_dashboard
FRONTEND_ORIGINS=http://localhost:5173,https://your-app.vercel.app
FRONTEND_ORIGIN_REGEX=https://.*\.vercel\.app
MODEL_RETRAIN_DAY=monday
MODEL_RETRAIN_HOUR=3
```

Install and run:

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Readiness check:

```bash
GET /ready
```

### 3. Frontend

Create `frontend/.env` from [frontend/.env.example](C:\Users\prith\Football Statistics Dashboard\frontend\.env.example).

Required variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
VITE_ENABLE_MSW=false
```

Install and run:

```bash
cd frontend
npm install
npm run dev
```

### 4. Mocking

MSW is scaffolded for development and testing under `frontend/src/mocks`. It can be expanded to simulate backend responses without spending API budget.

## Backend API Notes

Key routes:

- `/api/fixtures`
- `/api/leagues/:leagueId/...`
- `/api/teams/...`
- `/api/players/...`
- `/api/referees/{referee_name}/analysis`
- `/api/predictions/{fixtureId}`

All browser-originated data requests go through FastAPI. The frontend never calls API-Football directly.

## Rate Limit Management

This project is intentionally conservative with API-Football free-tier usage.

- Redis is checked before every upstream API-Football call
- Upstream requests are blocked after 80 calls/day to preserve a 20-call safety buffer under the 100/day plan
- A `429 Daily API limit reached` response is returned when the budget is exhausted
- Cache TTL strategy:
  - live match events: 30 seconds
  - standings and fixtures: 5 minutes
  - player/team season stats: 1 hour
  - head-to-head and historical data: 24 hours
  - completed match event timelines: stored permanently in the backend database
- Referee analysis results are derived from fetched fixture history and persisted in the backend database
- Prediction outputs are cached for 1 hour and include timestamps plus validity windows

## Prediction Pipeline

The backend prediction system includes:

- engineered form, xG, fatigue, head-to-head, opponent-strength, and availability features
- separate home and away goal prediction paths
- win/draw/loss probability output
- confidence labeling
- weekly retrain scaffolding scheduled for Monday at 03:00 UTC

Outputs are stored in the backend database and exposed through `/api/predictions/{fixtureId}`.

## Verification Completed

These checks were run locally:

- `npm run build` in `frontend`
- `python -m compileall .` in `backend`
- FastAPI smoke test for:
  - `/ready`
  - `/api/referees/Michael%20Oliver/analysis`
  - `/api/predictions/999`

The smoke test returned `200` for the API routes and confirmed the prediction payload includes the expected keys plus the referee analysis payload includes computed card, penalty, bias, and recent fixture data.

## Remaining Practical Notes

- The Vite production build currently warns that the main JS chunk is above 500 kB. Route-level code splitting would be the next optimization pass.
- The current end-to-end validation is a build-and-route smoke test pass rather than a browser-driven Playwright/Cypress suite.
- API-Football league IDs used for onboarding fallbacks are mapped in frontend logic and can be expanded if you want broader regional coverage.
- [frontend/vercel.json](C:\Users\prith\Football Statistics Dashboard\frontend\vercel.json) includes SPA rewrites for React Router deep links.

## Deployment

- Frontend: Vercel
- Backend: Railway
- Redis: Railway plugin
- Auth plus user data: Supabase
- Database: Railway Postgres recommended

For production:

- point `VITE_API_BASE_URL` at the Railway backend URL
- set `FRONTEND_ORIGINS` to your local and production frontend origins
- optionally set `FRONTEND_ORIGIN_REGEX` for Vercel preview URLs
- configure Railway health checks against `/ready`
