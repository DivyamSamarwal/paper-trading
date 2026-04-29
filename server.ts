import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { getSQL } from './src/lib/db';
import { ticker } from './src/lib/ticker';

import { blackScholesPrice } from './src/lib/greeks';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3001', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url!, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const wss = new WebSocketServer({ noServer: true });

    // Global state broadcast loop
    ticker.subscribe(async (event) => {
        if (event !== 'tick') return;

        let hasClients = false;
        wss.clients.forEach(client => {
            if (client.readyState === 1 /* ws.OPEN */) hasClients = true;
        });

        // Skip DB queries entirely if no one is watching
        if (!hasClients) return;

        try {
            const sql = await getSQL();
            const now = Math.floor(Date.now() / 1000);

            // 1. Fetch Global Data ONCE
            const symbolsDb = await sql`SELECT * FROM symbols ORDER BY ticker`;
            const symbolsPayload = symbolsDb.map(s => ({
                ...s,
                current_price: Number(s.current_price),
                prev_close: Number(s.prev_close),
                day_high: Number(s.day_high),
                day_low: Number(s.day_low),
                base_price: Number(s.base_price),
                day_open: Number(s.day_open),
                volume_today: Number(s.volume_today),
                margin_req: Number(s.margin_req),
                lot_size: Number(s.lot_size),
            }));

            const recentCandles = await sql`
                SELECT symbol_id, timestamp, open, high, low, close, volume
                FROM price_history
                WHERE timestamp >= ${now - 5}
                ORDER BY timestamp DESC
            `;

            const candlesData = recentCandles.map(c => ({
                symbol_id: c.symbol_id,
                timestamp: Number(c.timestamp),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
                volume: Number(c.volume),
            }));

            const options = symbolsDb.filter(s => s.asset_type === 'OPTION');
            for (const opt of options) {
                const existing = candlesData.find(c => c.symbol_id === opt.id);
                if (!existing) {
                    const under = symbolsDb.find(s => s.ticker === opt.underlying);
                    const underCandle = under ? candlesData.find(c => c.symbol_id === under.id) : null;
                    
                    if (underCandle) {
                        const T = Math.max(0, (new Date(opt.option_expiry).getTime() - Date.now()) / (365 * 86400000));
                        const pOpen = blackScholesPrice(opt.option_type as 'CALL' | 'PUT', underCandle.open, opt.option_strike, T, 0.05, opt.iv);
                        const pHigh = blackScholesPrice(opt.option_type as 'CALL' | 'PUT', underCandle.high, opt.option_strike, T, 0.05, opt.iv);
                        const pLow = blackScholesPrice(opt.option_type as 'CALL' | 'PUT', underCandle.low, opt.option_strike, T, 0.05, opt.iv);
                        const pClose = blackScholesPrice(opt.option_type as 'CALL' | 'PUT', underCandle.close, opt.option_strike, T, 0.05, opt.iv);

                        const prices = [pOpen, pHigh, pLow, pClose];
                        candlesData.push({
                            symbol_id: opt.id as string,
                            timestamp: now,
                            open: Math.max(0.01, Math.round(pOpen * 100) / 100),
                            high: Math.max(0.01, Math.round(Math.max(...prices) * 100) / 100),
                            low: Math.max(0.01, Math.round(Math.min(...prices) * 100) / 100),
                            close: Math.max(0.01, Math.round(pClose * 100) / 100),
                            volume: 0,
                        });
                    } else {
                        candlesData.push({
                            symbol_id: opt.id as string,
                            timestamp: now,
                            open: Number(opt.current_price),
                            high: Number(opt.current_price),
                            low: Number(opt.current_price),
                            close: Number(opt.current_price),
                            volume: 0,
                        });
                    }
                }
            }

            const newsDb = await sql`SELECT * FROM news_events ORDER BY id DESC LIMIT 5`;
            const newsPayload = newsDb.map(n => ({
                id: n.id,
                headline: n.headline,
                type: n.type,
                impact: Number(n.impact),
                affectedTickers: typeof n.affected_tickers === 'string' ? n.affected_tickers.split(',') : [],
                timestamp: n.created_at,
            }));

            const globalSymbolsString = JSON.stringify({ event: 'symbols', data: symbolsPayload });
            const globalCandlesString = candlesData.length > 0 ? JSON.stringify({ event: 'candles', data: candlesData }) : null;
            const globalNewsString = newsPayload.length > 0 ? JSON.stringify({ event: 'news', data: newsPayload }) : null;

            // 2. Broadcast to all clients
            for (const client of wss.clients) {
                if (client.readyState !== 1 /* ws.OPEN */) continue;

                try {
                    client.send(globalSymbolsString);
                    if (globalCandlesString) client.send(globalCandlesString);
                    if (globalNewsString) client.send(globalNewsString);

                    // Fetch individual portfolio if they supplied a userId
                    // @ts-ignore
                    const userId = client._userId;
                    if (userId) {
                        const portfolio = await getPortfolio(sql, userId);
                        if (portfolio) {
                            client.send(JSON.stringify({ event: 'portfolio', data: portfolio }));
                        }
                    }
                } catch (err) {
                    console.error('[WS] Client broadcast error:', err);
                }
            }
        } catch (e) {
            console.error('[WS] Global broadcast error:', e);
        }
    });

    wss.on('connection', async (ws: any, request: any, userId: any) => {
        ws._userId = userId; // Store for the global tick loop

        const send = (event: string, data: unknown) => {
            if (ws.readyState !== ws.OPEN) return;
            try {
                ws.send(JSON.stringify({ event, data }));
            } catch {
                // Ignore
            }
        };

        // Send initial snapshot only for this specific client
        try {
            const sql = await getSQL();

            const symbols = await sql`SELECT * FROM symbols ORDER BY ticker`;
            send('symbols', symbols.map(s => ({
                ...s,
                current_price: Number(s.current_price),
                prev_close: Number(s.prev_close),
                day_high: Number(s.day_high),
                day_low: Number(s.day_low),
                base_price: Number(s.base_price),
                day_open: Number(s.day_open),
                volume_today: Number(s.volume_today),
                margin_req: Number(s.margin_req),
                lot_size: Number(s.lot_size),
            })));

            if (userId) {
                const portfolio = await getPortfolio(sql, userId as string);
                if (portfolio) send('portfolio', portfolio);
            }

            const news = await sql`SELECT * FROM news_events ORDER BY id DESC LIMIT 20`;
            send('news', news.map(n => ({
                id: n.id,
                headline: n.headline,
                type: n.type,
                impact: Number(n.impact),
                affectedTickers: typeof n.affected_tickers === 'string' ? n.affected_tickers.split(',') : [],
                timestamp: n.created_at,
            })));
        } catch (e) {
            console.error('[WS] Initial snapshot error:', e);
        }

        ws.on('error', () => { });
    });

    server.on('upgrade', (request, socket, head) => {
        const { pathname, query } = parse(request.url!, true);
        if (pathname === '/ws') {
            const userId = query.userId as string;
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, userId);
            });
        }
    });

    server.once('error', (err) => {
        console.error(err);
        process.exit(1);
    });

    server.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPortfolio(sql: any, userId: string) {
    const userRows = await sql`SELECT cash_balance FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) return null;
    const cashBalance = Number(userRows[0].cash_balance);

    const positions = await sql`
        SELECT p.*, s.ticker, s.name, s.current_price, s.asset_type, s.prev_close, s.margin_req
        FROM positions p JOIN symbols s ON s.id = p.symbol_id
        WHERE p.user_id = ${userId}
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positionsWithPnl = positions.map((pos: any) => {
        const currentPrice = Number(pos.current_price);
        const avgPrice = Number(pos.avg_price);
        const qty = Number(pos.quantity);
        const marginUsed = Number(pos.margin_used);
        const unrealizedPnl = pos.side === 'LONG' ? (currentPrice - avgPrice) * qty : (avgPrice - currentPrice) * qty;
        const marketValue = currentPrice * qty;
        const pnlPct = ((currentPrice - avgPrice) / avgPrice) * 100 * (pos.side === 'LONG' ? 1 : -1);
        return {
            id: pos.id, symbol_id: pos.symbol_id, ticker: pos.ticker, name: pos.name,
            quantity: qty, avg_price: avgPrice, side: pos.side, current_price: currentPrice,
            asset_type: pos.asset_type, margin_used: marginUsed,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            marketValue: Math.round(marketValue * 100) / 100,
            pnlPct: Math.round(pnlPct * 100) / 100,
        };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portfolioValue = cashBalance + positionsWithPnl.reduce((s: number, p: any) => s + p.marketValue, 0);

    return {
        cashBalance: Math.round(cashBalance * 100) / 100,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        positions: positionsWithPnl,
    };
}
