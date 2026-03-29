import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface SymbolDef {
    ticker: string;
    name: string;
    type: 'EQUITY' | 'FUTURE' | 'OPTION' | 'COMMODITY';
    price: number;
    lotSize: number;
    marginReq: number;
    underlying?: string;
    optionType?: 'CALL' | 'PUT';
    optionStrike?: number;
    optionExpiry?: string;
}

const EQUITIES: SymbolDef[] = [
    { ticker: 'AAPL', name: 'Apple Inc.', type: 'EQUITY', price: 185, lotSize: 1, marginReq: 1 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', type: 'EQUITY', price: 420, lotSize: 1, marginReq: 1 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', type: 'EQUITY', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', type: 'EQUITY', price: 185, lotSize: 1, marginReq: 1 },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', type: 'EQUITY', price: 880, lotSize: 1, marginReq: 1 },
    { ticker: 'TSLA', name: 'Tesla Inc.', type: 'EQUITY', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'META', name: 'Meta Platforms Inc.', type: 'EQUITY', price: 500, lotSize: 1, marginReq: 1 },
    { ticker: 'JPM', name: 'JPMorgan Chase & Co.', type: 'EQUITY', price: 195, lotSize: 1, marginReq: 1 },
    { ticker: 'V', name: 'Visa Inc.', type: 'EQUITY', price: 280, lotSize: 1, marginReq: 1 },
    { ticker: 'JNJ', name: 'Johnson & Johnson', type: 'EQUITY', price: 155, lotSize: 1, marginReq: 1 },
    { ticker: 'WMT', name: 'Walmart Inc.', type: 'EQUITY', price: 175, lotSize: 1, marginReq: 1 },
    { ticker: 'PG', name: 'Procter & Gamble', type: 'EQUITY', price: 165, lotSize: 1, marginReq: 1 },
    { ticker: 'MA', name: 'Mastercard Inc.', type: 'EQUITY', price: 460, lotSize: 1, marginReq: 1 },
    { ticker: 'HD', name: 'Home Depot Inc.', type: 'EQUITY', price: 375, lotSize: 1, marginReq: 1 },
    { ticker: 'DIS', name: 'Walt Disney Co.', type: 'EQUITY', price: 110, lotSize: 1, marginReq: 1 },
];

const FUTURES: SymbolDef[] = [
    { ticker: 'ES', name: 'S&P 500 E-mini', type: 'FUTURE', price: 5200, lotSize: 1, marginReq: 0.1 },
    { ticker: 'NQ', name: 'Nasdaq 100 E-mini', type: 'FUTURE', price: 18500, lotSize: 1, marginReq: 0.1 },
    { ticker: 'YM', name: 'Dow Jones E-mini', type: 'FUTURE', price: 39200, lotSize: 1, marginReq: 0.1 },
    { ticker: 'RTY', name: 'Russell 2000 E-mini', type: 'FUTURE', price: 2050, lotSize: 1, marginReq: 0.1 },
    { ticker: 'CL', name: 'Crude Oil Future', type: 'FUTURE', price: 78, lotSize: 100, marginReq: 0.1 },
    { ticker: 'GC', name: 'Gold Future', type: 'FUTURE', price: 2100, lotSize: 10, marginReq: 0.1 },
    { ticker: 'SI', name: 'Silver Future', type: 'FUTURE', price: 24, lotSize: 100, marginReq: 0.1 },
    { ticker: 'HG', name: 'Copper Future', type: 'FUTURE', price: 4.2, lotSize: 100, marginReq: 0.1 },
    { ticker: 'NG', name: 'Natural Gas Future', type: 'FUTURE', price: 2.5, lotSize: 1000, marginReq: 0.1 },
    { ticker: 'ZB', name: '30Y Treasury Bond', type: 'FUTURE', price: 118, lotSize: 100, marginReq: 0.1 },
    { ticker: 'ZN', name: '10Y Treasury Note', type: 'FUTURE', price: 110, lotSize: 100, marginReq: 0.1 },
    { ticker: 'ZC', name: 'Corn Future', type: 'FUTURE', price: 450, lotSize: 50, marginReq: 0.1 },
    { ticker: 'ZW', name: 'Wheat Future', type: 'FUTURE', price: 580, lotSize: 50, marginReq: 0.1 },
    { ticker: 'ZS', name: 'Soybean Future', type: 'FUTURE', price: 1180, lotSize: 50, marginReq: 0.1 },
];

const COMMODITIES: SymbolDef[] = [
    { ticker: 'XAUUSD', name: 'Gold Spot', type: 'COMMODITY', price: 2100, lotSize: 1, marginReq: 0.2 },
    { ticker: 'XAGUSD', name: 'Silver Spot', type: 'COMMODITY', price: 24, lotSize: 100, marginReq: 0.2 },
    { ticker: 'XPTUSD', name: 'Platinum Spot', type: 'COMMODITY', price: 920, lotSize: 1, marginReq: 0.2 },
    { ticker: 'XPDUSD', name: 'Palladium Spot', type: 'COMMODITY', price: 980, lotSize: 1, marginReq: 0.2 },
    { ticker: 'WTIUSD', name: 'WTI Crude Oil', type: 'COMMODITY', price: 78, lotSize: 100, marginReq: 0.2 },
    { ticker: 'NGUSD', name: 'Natural Gas', type: 'COMMODITY', price: 2.50, lotSize: 1000, marginReq: 0.2 },
    { ticker: 'XCUUSD', name: 'Copper', type: 'COMMODITY', price: 4.20, lotSize: 100, marginReq: 0.2 },
    { ticker: 'WHEAT', name: 'Wheat Spot', type: 'COMMODITY', price: 580, lotSize: 50, marginReq: 0.2 },
    { ticker: 'CORN', name: 'Corn Spot', type: 'COMMODITY', price: 450, lotSize: 50, marginReq: 0.2 },
    { ticker: 'SOYBEAN', name: 'Soybean Spot', type: 'COMMODITY', price: 1180, lotSize: 50, marginReq: 0.2 },
    { ticker: 'COTTON', name: 'Cotton', type: 'COMMODITY', price: 82, lotSize: 100, marginReq: 0.2 },
];

export function seedMarket(db: Database.Database) {
    const insert = db.prepare(`
    INSERT INTO symbols (id, ticker, name, asset_type, base_price, current_price, prev_close, day_open, day_high, day_low, lot_size, margin_req, underlying, option_type, option_strike, option_expiry, iv)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const allSymbols = [...EQUITIES, ...FUTURES, ...COMMODITIES];
    const now = Math.floor(Date.now() / 1000);

    const seedTx = db.transaction(() => {
        for (const s of allSymbols) {
            const id = uuid();
            insert.run(id, s.ticker, s.name, s.type, s.price, s.price, s.price, s.price, s.price, s.price, s.lotSize, s.marginReq, null, null, null, null, 0.3);
            // Generate initial price history (last 500 candles at 10-second intervals)
            generateInitialHistory(db, id, s.price, now);
        }

        // Generate options for top 5 equities
        const topEquities = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'META'];
        for (const ticker of topEquities) {
            const eq = db.prepare('SELECT id, current_price FROM symbols WHERE ticker = ?').get(ticker) as { id: string; current_price: number } | undefined;
            if (!eq) continue;
            const basePrice = eq.current_price;

            for (const expDays of [7, 14, 30]) {
                const expiry = new Date(Date.now() + expDays * 86400000).toISOString();
                const strikes = [
                    Math.round(basePrice * 0.9),
                    Math.round(basePrice * 0.95),
                    Math.round(basePrice),
                    Math.round(basePrice * 1.05),
                    Math.round(basePrice * 1.1),
                ];

                for (const strike of strikes) {
                    for (const optType of ['CALL', 'PUT'] as const) {
                        const premium = calcSimplePremium(optType, basePrice, strike, expDays);
                        const optTicker = `${ticker}_${strike}${optType[0]}_${expDays}D`;
                        const optName = `${ticker} $${strike} ${optType} ${expDays}D`;
                        insert.run(uuid(), optTicker, optName, 'OPTION', premium, premium, premium, premium, premium, premium, 100, 1.0, ticker, optType, strike, expiry, 0.3);
                    }
                }
            }
        }
    });

    seedTx();
}

function calcSimplePremium(type: 'CALL' | 'PUT', spot: number, strike: number, days: number): number {
    const T = days / 365;
    const sigma = 0.3;
    const intrinsic = type === 'CALL' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const timeValue = spot * sigma * Math.sqrt(T) * 0.4;
    return Math.round((intrinsic + timeValue) * 100) / 100;
}

function generateInitialHistory(db: Database.Database, symbolId: string, basePrice: number, nowTs: number) {
    const insert = db.prepare('INSERT INTO price_history (symbol_id, timestamp, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?)');
    let price = basePrice;
    const volatility = 0.001;

    for (let i = 500; i >= 0; i--) {
        const ts = nowTs - i * 10;
        const change = price * volatility * (Math.random() * 2 - 1);
        const open = price;
        price = Math.max(price * 0.5, price + change);
        const high = Math.max(open, price) * (1 + Math.random() * 0.001);
        const low = Math.min(open, price) * (1 - Math.random() * 0.001);
        const vol = Math.floor(Math.random() * 1000) + 100;
        insert.run(symbolId, ts, round2(open), round2(high), round2(low), round2(price), vol);
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
