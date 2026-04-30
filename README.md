# Institutional Paper Trading Terminal

A professional-grade, high-frequency paper trading engine and dashboard built with **Next.js 15**, **WebSockets**, and a **Persistent Market Simulation Engine**.

Designed to simulate real-world market dynamics, this terminal includes sophisticated pricing models, anti-manipulation guardrails, and institutional-grade risk management.

## 🚀 Key Features

### 1. Persistent Market Cycles
*   **Clock-Based Resets**: The market operates on a persistent 8-hour cycle (00:00, 08:00, 16:00 UTC).
*   **Metric Integrity**: Day High/Low, Previous Close, and Volume metrics persist through server restarts via a dedicated `settings` layer in the database.
*   **IST Localization**: UI timestamps and market resets are synchronized with India Standard Time (IST) for a seamless user experience.

### 2. Professional Pricing Engine
*   **Gaussian Random Walk**: Assets follow a stochastic price path with mean reversion and momentum factors.
*   **Black-Scholes Options**: Options are priced in real-time using the Black-Scholes model, accounting for Theta decay (Time), Delta (Price Sensitivity), and IV (Volatility).
*   **Dynamic Option Chains**: Strike prices are automatically rotated every market session to ensure "At-The-Money" contracts are always available for trade.

### 3. Anti-Manipulation & Risk Guardrails
*   **Trading Cooldown**: A server-side 3-second cooldown per user prevents rapid-fire order spamming and market manipulation.
*   **Realistic Price Impact**: Implements a linear slippage model (0.01% per 100 shares), ensuring large orders move the market realistically without allowing for "wash trading" exploits.
*   **Auto-Liquidation**: Futures positions are protected by a maintenance margin system. Positions are automatically liquidated if losses exceed 80% of the posted margin.

### 4. Automated Settlement System
*   **Option Expiry**: The engine automatically detects expired contracts.
*   **Cash Payouts**: In-The-Money (ITM) options are settled into the user's cash balance based on their final Intrinsic Value at the exact moment of expiry.

---

## 🛠 Tech Stack

*   **Framework**: Next.js 15 (App Router)
*   **Real-time**: Custom WebSocket Server (tsx) + Singleton Ticker Pattern
*   **Database**: Hybrid SQLite (Local) / PostgreSQL (Neon) with WAL Mode
*   **Logic**: Black-Scholes Greek Engine, Linear Impact Price Modeler

---

## 📂 Project Structure

```bash
src/
├── app/                  # Next.js App Router (Routes & Layouts)
├── components/           # UI Components (OrderPanel, NewsFeed, Charts)
├── lib/                  # Core Intelligence
│   ├── db.ts             # Hybrid persistence layer
│   ├── price-engine.ts   # Market simulation & Reset logic
│   ├── greeks.ts         # Black-Scholes & Settlement engine
│   ├── news.ts           # Sentiment-driven event generator
│   └── ticker.ts         # High-frequency tick singleton
```

---

## 🔧 Installation & Setup

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/your-username/paper-trading.git
    npm install
    ```
2.  **Environment Configuration** (`.env.local`):
    ```env
    DATABASE_URL=""   # Optional: Neon DB URL (defaults to local trading.db)
    NEXTAUTH_SECRET="your-32-character-secret"
    NEXTAUTH_URL="http://localhost:3001"
    ```
3.  **Launch Terminal**:
    ```bash
    npm run dev
    ```
    Visit [http://localhost:3001](http://localhost:3001).

---

## 📈 Major Improvements (V2.0)

*   **[Fixed]** Stale market metrics on restart (Migrated to persistent settings).
*   **[Fixed]** Option price spikes (Implemented BS-initialization for new strikes).
*   **[Fixed]** News Feed timestamp desync (Normalized UTC to local IST).
*   **[Fixed]** React Hook Order violation in OrderPanel (Stabilized UI during trades).
*   **[Fixed]** Database Locking (Enabled WAL mode for high-concurrency simulation).
*   **[Added]** Dynamic Option Rotation (Strike prices now follow the underlying stock).
*   **[Added]** Settlement Engine (Automatic payout for expired ITM options).
*   **[Added]** 3-Second Rate Limiting (Prevents HFT-style market manipulation).
*   **[Added]** Market Circuit Breakers (+/- 10% daily limits for stability).
*   **[Added]** Professional News UI (Sentiment badges and Title Case formatting).

---

## ⚖ License
MIT
