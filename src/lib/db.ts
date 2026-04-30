import path from 'path';

// ─── DB abstraction: SQLite locally, Neon in production ──────────────────────

const isNeon = !!(process.env.DATABASE_URL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type SqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

let _sql: SqlFn | null = null;

async function buildSql(): Promise<SqlFn> {
  if (_sql) return _sql;

  if (isNeon) {
    const { neon, neonConfig } = await import('@neondatabase/serverless');
    neonConfig.fetchConnectionCache = true;
    // neon() returns a tagged template function matching our SqlFn signature
    _sql = neon(process.env.DATABASE_URL!) as unknown as SqlFn;
  } else {
    // Local SQLite fallback using @libsql/client
    const { createClient } = await import('@libsql/client');
    const dbPath = path.join(process.cwd(), 'trading.db');
    const db = createClient({ url: `file:${dbPath}` });

    // Enable WAL mode for concurrent reads + busy timeout so queries wait instead of failing
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA busy_timeout = 5000');

    _sql = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> => {
      const parts = Array.from(strings.raw);
      let query = '';
      const args: (string | number | null | bigint | ArrayBuffer | boolean)[] = [];

      for (let i = 0; i < parts.length; i++) {
        // Map Postgres-specific syntax to SQLite
        let part = parts[i]
          .replace(/\bDOUBLE PRECISION\b/g, 'REAL')
          .replace(/\bTIMESTAMPTZ\b/g, 'TEXT')
          .replace(/\bSERIAL PRIMARY KEY\b/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
          .replace(/\bNOW\(\)/g, "datetime('now')")
          // GREATEST/LEAST → MAX/MIN in SQLite expressions
          .replace(/\bGREATEST\(/g, 'MAX(')
          .replace(/\bLEAST\(/g, 'MIN(')
          // ILIKE → LIKE (SQLite doesn't have ILIKE, but LIKE is case-insensitive for ASCII)
          .replace(/\bILIKE\b/g, 'LIKE')
          // COALESCE is supported in SQLite, no change needed
          // NOW() - INTERVAL not supported, approximate with datetime
          .replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*seconds?'/g, "datetime('now', '-$1 seconds')")
          .replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*minutes?'/g, "datetime('now', '-$1 minutes')");

        query += part;
        if (i < values.length) {
          query += '?';
          const v = values[i];
          args.push(v as string | number | null | bigint | ArrayBuffer | boolean);
        }
      }

      const result = await db.execute({ sql: query, args });
      // Convert libsql Row objects to plain Record<string, unknown>
      return result.rows.map(row => {
        const plain: Row = {};
        result.columns.forEach((col, i) => { plain[col] = row[i]; });
        return plain;
      });
    };
  }

  return _sql;
}

export async function getSQL(): Promise<SqlFn> {
  return buildSql();
}

let _initialized = false;

export async function initDb() {
  if (_initialized) return;
  const sql = await getSQL();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      cash_balance REAL NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS symbols (
      id TEXT PRIMARY KEY,
      ticker TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      base_price REAL NOT NULL,
      current_price REAL NOT NULL,
      prev_close REAL NOT NULL,
      day_open REAL NOT NULL,
      day_high REAL NOT NULL,
      day_low REAL NOT NULL,
      volume_today INTEGER NOT NULL DEFAULT 0,
      lot_size INTEGER NOT NULL DEFAULT 1,
      margin_req REAL NOT NULL DEFAULT 1.0,
      underlying TEXT,
      option_type TEXT,
      option_strike REAL,
      option_expiry TEXT,
      iv REAL DEFAULT 0.3,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id TEXT NOT NULL REFERENCES symbols(id),
      timestamp INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_ph_symbol_ts ON price_history(symbol_id, timestamp)`;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      symbol_id TEXT NOT NULL REFERENCES symbols(id),
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      filled_price REAL,
      slippage REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      filled_at TEXT
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      symbol_id TEXT NOT NULL REFERENCES symbols(id),
      quantity INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      side TEXT NOT NULL,
      margin_used REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, symbol_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pos_user ON positions(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS trade_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      symbol_id TEXT NOT NULL REFERENCES symbols(id),
      side TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      commission REAL NOT NULL DEFAULT 0,
      slippage REAL NOT NULL DEFAULT 0,
      realized_pnl REAL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_th_user ON trade_history(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS news_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headline TEXT NOT NULL,
      type TEXT NOT NULL,
      impact REAL NOT NULL,
      affected_tickers TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPCOMING',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS competition_entries (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      starting_balance REAL NOT NULL,
      final_balance REAL,
      profit REAL,
      rank INTEGER,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(competition_id, user_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_ce_comp ON competition_entries(competition_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ce_user ON competition_entries(user_id)`;
  
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      val TEXT NOT NULL
    )
  `;

  // Seed if empty
  const result = await sql`SELECT COUNT(*) as c FROM symbols`;
  const count = Number(result[0]?.c ?? 0);
  if (count === 0) {
    await seedMarket(sql);
  }

  _initialized = true;
}

async function seedMarket(sql: SqlFn) {
  const { v4: genuuid } = await import('uuid');

  const EQUITIES = [
    { ticker: 'AAPL', name: 'Apple Inc.', price: 185, lotSize: 1, marginReq: 1 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', price: 420, lotSize: 1, marginReq: 1 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 185, lotSize: 1, marginReq: 1 },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 880, lotSize: 1, marginReq: 1 },
    { ticker: 'TSLA', name: 'Tesla Inc.', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'META', name: 'Meta Platforms Inc.', price: 500, lotSize: 1, marginReq: 1 },
    { ticker: 'JPM', name: 'JPMorgan Chase & Co.', price: 195, lotSize: 1, marginReq: 1 },
    { ticker: 'V', name: 'Visa Inc.', price: 280, lotSize: 1, marginReq: 1 },
    { ticker: 'JNJ', name: 'Johnson & Johnson', price: 155, lotSize: 1, marginReq: 1 },
    { ticker: 'WMT', name: 'Walmart Inc.', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'PG', name: 'Procter & Gamble', price: 165, lotSize: 1, marginReq: 1 },
    { ticker: 'MA', name: 'Mastercard Inc.', price: 460, lotSize: 1, marginReq: 1 },
    { ticker: 'HD', name: 'Home Depot Inc.', price: 375, lotSize: 1, marginReq: 1 },
    { ticker: 'DIS', name: 'Walt Disney Co.', price: 110, lotSize: 1, marginReq: 1 },
  ];

  const FUTURES = [
    { ticker: 'ES', name: 'S&P 500 E-mini', price: 5200, lotSize: 1, marginReq: 0.1 },
    { ticker: 'NQ', name: 'Nasdaq 100 E-mini', price: 18500, lotSize: 1, marginReq: 0.1 },
    { ticker: 'YM', name: 'Dow Jones E-mini', price: 39200, lotSize: 1, marginReq: 0.1 },
    { ticker: 'RTY', name: 'Russell 2000 E-mini', price: 2050, lotSize: 1, marginReq: 0.1 },
    { ticker: 'CL', name: 'Crude Oil Future', price: 78, lotSize: 100, marginReq: 0.1 },
    { ticker: 'GC', name: 'Gold Future', price: 2100, lotSize: 10, marginReq: 0.1 },
    { ticker: 'SI', name: 'Silver Future', price: 24, lotSize: 100, marginReq: 0.1 },
    { ticker: 'HG', name: 'Copper Future', price: 4.2, lotSize: 100, marginReq: 0.1 },
    { ticker: 'NG', name: 'Natural Gas Future', price: 2.5, lotSize: 1000, marginReq: 0.1 },
    { ticker: 'ZB', name: '30Y Treasury Bond', price: 118, lotSize: 100, marginReq: 0.1 },
    { ticker: 'ZN', name: '10Y Treasury Note', price: 110, lotSize: 100, marginReq: 0.1 },
    { ticker: 'ZC', name: 'Corn Future', price: 450, lotSize: 50, marginReq: 0.1 },
    { ticker: 'ZW', name: 'Wheat Future', price: 580, lotSize: 50, marginReq: 0.1 },
    { ticker: 'ZS', name: 'Soybean Future', price: 1180, lotSize: 50, marginReq: 0.1 },
  ];

  const COMMODITIES = [
    { ticker: 'XAUUSD', name: 'Gold Spot', price: 2100, lotSize: 1, marginReq: 0.2 },
    { ticker: 'XAGUSD', name: 'Silver Spot', price: 24, lotSize: 100, marginReq: 0.2 },
    { ticker: 'XPTUSD', name: 'Platinum Spot', price: 920, lotSize: 1, marginReq: 0.2 },
    { ticker: 'XPDUSD', name: 'Palladium Spot', price: 980, lotSize: 1, marginReq: 0.2 },
    { ticker: 'WTIUSD', name: 'WTI Crude Oil', price: 78, lotSize: 100, marginReq: 0.2 },
    { ticker: 'NGUSD', name: 'Natural Gas', price: 2.50, lotSize: 1000, marginReq: 0.2 },
    { ticker: 'XCUUSD', name: 'Copper', price: 4.20, lotSize: 100, marginReq: 0.2 },
    { ticker: 'WHEAT', name: 'Wheat Spot', price: 580, lotSize: 50, marginReq: 0.2 },
    { ticker: 'CORN', name: 'Corn Spot', price: 450, lotSize: 50, marginReq: 0.2 },
    { ticker: 'SOYBEAN', name: 'Soybean Spot', price: 1180, lotSize: 50, marginReq: 0.2 },
    { ticker: 'COTTON', name: 'Cotton', price: 82, lotSize: 100, marginReq: 0.2 },
  ];

  const allSymbols = [
    ...EQUITIES.map(s => ({ ...s, type: 'EQUITY' as const })),
    ...FUTURES.map(s => ({ ...s, type: 'FUTURE' as const })),
    ...COMMODITIES.map(s => ({ ...s, type: 'COMMODITY' as const })),
  ];

  const nowTs = Math.floor(Date.now() / 1000);

  for (const s of allSymbols) {
    const id = genuuid();
    await sql`INSERT OR IGNORE INTO symbols (id, ticker, name, asset_type, base_price, current_price, prev_close, day_open, day_high, day_low, lot_size, margin_req)
      VALUES (${id}, ${s.ticker}, ${s.name}, ${s.type}, ${s.price}, ${s.price}, ${s.price}, ${s.price}, ${s.price}, ${s.price}, ${s.lotSize}, ${s.marginReq})`;

    let price = s.price;
    for (let i = 100; i >= 0; i--) {
      const ts = nowTs - i * 10;
      const change = price * 0.001 * (Math.random() * 2 - 1);
      const open = price;
      price = Math.max(price * 0.5, price + change);
      const high = Math.round(Math.max(open, price) * (1 + Math.random() * 0.001) * 100) / 100;
      const low = Math.round(Math.min(open, price) * (1 - Math.random() * 0.001) * 100) / 100;
      const vol = Math.floor(Math.random() * 1000) + 100;
      await sql`INSERT INTO price_history (symbol_id, timestamp, open, high, low, close, volume) VALUES (${id}, ${ts}, ${round2(open)}, ${high}, ${low}, ${round2(price)}, ${vol})`;
    }
  }

  const topEquities = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'META'];
  for (const ticker of topEquities) {
    const eqRows = await sql`SELECT id, current_price FROM symbols WHERE ticker = ${ticker}`;
    if (eqRows.length === 0) continue;
    const basePrice = Number(eqRows[0].current_price);

    for (const expDays of [7, 14, 30]) {
      const expiry = new Date(Date.now() + expDays * 86400000).toISOString();
      const strikes = [
        Math.round(basePrice * 0.9), Math.round(basePrice * 0.95),
        Math.round(basePrice), Math.round(basePrice * 1.05), Math.round(basePrice * 1.1),
      ];

      for (const strike of strikes) {
        for (const optType of ['CALL', 'PUT'] as const) {
          const T = expDays / 365;
          const intrinsic = optType === 'CALL' ? Math.max(0, basePrice - strike) : Math.max(0, strike - basePrice);
          const timeValue = basePrice * 0.3 * Math.sqrt(T) * 0.4;
          const premium = round2(intrinsic + timeValue);
          const optTicker = `${ticker}_${strike}${optType[0]}_${expDays}D`;
          const optName = `${ticker} $${strike} ${optType} ${expDays}D`;
          await sql`INSERT OR IGNORE INTO symbols (id, ticker, name, asset_type, base_price, current_price, prev_close, day_open, day_high, day_low, lot_size, margin_req, underlying, option_type, option_strike, option_expiry, iv)
            VALUES (${genuuid()}, ${optTicker}, ${optName}, 'OPTION', ${premium}, ${premium}, ${premium}, ${premium}, ${premium}, ${premium}, 100, 1.0, ${ticker}, ${optType}, ${strike}, ${expiry}, 0.3)`;
        }
      }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
