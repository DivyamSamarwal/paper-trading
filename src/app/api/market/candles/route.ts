import { NextRequest, NextResponse } from 'next/server';
import { getSQL, initDb } from '@/lib/db';
import { blackScholesPrice } from '@/lib/greeks';

export async function GET(req: NextRequest) {
    try {
        await initDb();
        const sql = await getSQL();
        const symbolId = req.nextUrl.searchParams.get('symbolId');
        const ticker = req.nextUrl.searchParams.get('ticker');
        const limit = parseInt(req.nextUrl.searchParams.get('limit') || '500');

        if (!symbolId && !ticker) {
            return NextResponse.json({ error: 'symbolId or ticker required' }, { status: 400 });
        }

        let sId = symbolId;
        if (!sId && ticker) {
            const sym = await sql`SELECT id FROM symbols WHERE ticker = ${ticker}`;
            if (sym.length === 0) return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
            sId = sym[0].id;
        }

        const symData = await sql`SELECT asset_type, underlying, option_type, option_strike, option_expiry, iv FROM symbols WHERE id = ${sId!}`;
        if (symData.length === 0) return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });

        const sym = symData[0];

        let candles;

        if (sym.asset_type === 'OPTION') {
            const underData = await sql`SELECT id FROM symbols WHERE ticker = ${sym.underlying}`;
            if (underData.length === 0) return NextResponse.json([], { status: 200 });

            const rawCandles = await sql`
                SELECT timestamp, open, high, low, close, volume
                FROM price_history WHERE symbol_id = ${underData[0].id}
                ORDER BY timestamp DESC LIMIT ${Math.min(limit, 2000)}
            `;

            const T = Math.max(0, (new Date(sym.option_expiry as string).getTime() - Date.now()) / (365 * 86400000));

            candles = rawCandles.map(c => {
                const optOpen = blackScholesPrice(sym.option_type as 'CALL' | 'PUT', Number(c.open), Number(sym.option_strike), T, 0.05, Number(sym.iv));
                const optHigh = blackScholesPrice(sym.option_type as 'CALL' | 'PUT', Number(c.high), Number(sym.option_strike), T, 0.05, Number(sym.iv));
                const optLow = blackScholesPrice(sym.option_type as 'CALL' | 'PUT', Number(c.low), Number(sym.option_strike), T, 0.05, Number(sym.iv));
                const optClose = blackScholesPrice(sym.option_type as 'CALL' | 'PUT', Number(c.close), Number(sym.option_strike), T, 0.05, Number(sym.iv));

                return {
                    timestamp: Number(c.timestamp),
                    open: Math.round(Math.max(0.01, optOpen) * 100) / 100,
                    high: Math.round(Math.max(0.01, optHigh) * 100) / 100,
                    low: Math.round(Math.max(0.01, optLow) * 100) / 100,
                    close: Math.round(Math.max(0.01, optClose) * 100) / 100,
                    volume: 0
                };
            });
        } else {
            const rawCandles = await sql`
                SELECT timestamp, open, high, low, close, volume
                FROM price_history WHERE symbol_id = ${sId!}
                ORDER BY timestamp DESC LIMIT ${Math.min(limit, 2000)}
            `;
            candles = rawCandles.map(c => ({
                timestamp: Number(c.timestamp),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
                volume: Number(c.volume)
            }));
        }

        return NextResponse.json(candles.reverse());
    } catch (error) {
        console.error('Candles error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
