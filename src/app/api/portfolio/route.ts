import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDb } from '@/lib/db';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await initDb();
        const sql = await getSQL();
        const userId = session.user.id;

        const userRows = await sql`SELECT cash_balance FROM users WHERE id = ${userId}`;
        if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 401 });
        const cashBalance = Number(userRows[0].cash_balance);

        const positions = await sql`
            SELECT p.*, s.ticker, s.name, s.current_price, s.asset_type, s.prev_close, s.margin_req
            FROM positions p JOIN symbols s ON s.id = p.symbol_id
            WHERE p.user_id = ${userId} ORDER BY p.created_at DESC
        `;

        const pendingOrders = await sql`
            SELECT o.*, s.ticker, s.name, s.current_price
            FROM orders o JOIN symbols s ON s.id = o.symbol_id
            WHERE o.user_id = ${userId} AND o.status = 'PENDING' ORDER BY o.created_at DESC
        `;

        let totalUnrealizedPnl = 0;
        let totalMarginUsed = 0;

        const positionsWithPnl = positions.map(pos => {
            const currentPrice = Number(pos.current_price);
            const avgPrice = Number(pos.avg_price);
            const qty = Number(pos.quantity);
            const marginUsed = Number(pos.margin_used);

            const unrealizedPnl = pos.side === 'LONG'
                ? (currentPrice - avgPrice) * qty
                : (avgPrice - currentPrice) * qty;
            const marketValue = currentPrice * qty;
            const pnlPct = ((currentPrice - avgPrice) / avgPrice) * 100 * (pos.side === 'LONG' ? 1 : -1);
            totalUnrealizedPnl += unrealizedPnl;
            totalMarginUsed += marginUsed;

            return {
                id: pos.id,
                symbol_id: pos.symbol_id,
                ticker: pos.ticker,
                name: pos.name,
                quantity: qty,
                avg_price: avgPrice,
                side: pos.side,
                current_price: currentPrice,
                asset_type: pos.asset_type,
                margin_used: marginUsed,
                unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
                marketValue: Math.round(marketValue * 100) / 100,
                pnlPct: Math.round(pnlPct * 100) / 100,
            };
        });

        const allocation: Record<string, number> = {};
        for (const pos of positionsWithPnl) {
            allocation[pos.asset_type] = (allocation[pos.asset_type] || 0) + pos.marketValue;
        }

        const portfolioValue = cashBalance + positionsWithPnl.reduce((sum, p) => sum + p.marketValue, 0);
        const totalReturn = ((portfolioValue - 1000) / 1000) * 100;

        return NextResponse.json({
            cashBalance: Math.round(cashBalance * 100) / 100,
            portfolioValue: Math.round(portfolioValue * 100) / 100,
            totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
            totalReturn: Math.round(totalReturn * 100) / 100,
            totalMarginUsed: Math.round(totalMarginUsed * 100) / 100,
            positions: positionsWithPnl,
            pendingOrders,
            allocation,
        });
    } catch (error) {
        console.error('Portfolio error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
