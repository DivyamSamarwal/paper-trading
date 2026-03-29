# Paper Trading Dashboard

A real-time paper trading engine and dashboard built with Next.js 15, WebSockets, and SQLite.

## Getting Started

### Prerequisites
- Node.js 20+
- npm (or pnpm/yarn)

### Installation
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/your-username/paper-trading.git
   npm install
   ```
2. Configure `.env.local`:
   ```env
   DATABASE_URL=""   # Fallback to local trading.db if empty
   NEXTAUTH_SECRET="your-32-character-secret"
   NEXTAUTH_URL="http://localhost:3001"
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   Go to [http://localhost:3001](http://localhost:3001).

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the custom Node.js server (tsx) for WebSockets and Next.js. |
| `npm run build` | Builds the Next.js application for production. |
| `npm run start` | Runs the production-built custom server. |
| `npm run lint` | Runs ESLint for code quality checks. |

## Project Structure

```bash
src/
├── app/                  # Next.js App Router (Routes & Layouts)
│   ├── api/              # Backend API endpoints (JSON/REST)
│   ├── competitions/     # Competition management pages
│   ├── dashboard/        # Main trading terminal
│   ├── leaderboard/      # Real-time ranking pages
│   └── portfolio/        # User portfolio tracking
├── components/           # Reusable UI components (Charts, Navbar, etc.)
├── lib/                  # Core application logic
│   ├── db.ts             # Hybrid SQLite/PostgreSQL layer
│   ├── price-engine.ts   # Market simulation logic
│   ├── ticker.ts         # Singleton price tick generator
│   └── auth.ts           # NextAuth configuration
└── types/                # TypeScript type definitions
```

## Frontend Routes

- `/dashboard`: Main trading terminal with live Candle charts and Order Panel.
- `/portfolio`: Overview of current holdings, cash balance, and margin status.
- `/history`: Historical log of all filled and rejected orders.
- `/leaderboard`: Global rankings based on real-time portfolio valuation.
- `/competitions`: Active and upcoming trading challenges.

## Core Concepts

### Hybrid Persistence
The application uses a custom template literal handler in `src/lib/db.ts` to seamlessly transition between local **SQLite** (with WAL mode enabled) and production **PostgreSQL (Neon)**.

### Real-Time Simulation
The `src/lib/ticker.ts` singleton generates price ticks every 1,000ms using a Gaussian random walk. Market impacts and mean reversion are calculated dynamically based on real order flow.

## License
MIT
