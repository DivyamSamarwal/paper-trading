import { NextResponse } from 'next/server';
import { getSQL, initDb } from '@/lib/db';

export async function GET() {
    try {
        await initDb();
        const sql = await getSQL();

        const rows = await sql`
            SELECT u.id, u.username, u.cash_balance, u.created_at,
                COALESCE(SUM(p.quantity * s.current_price), 0) as position_value,
                COALESCE(SUM(
                    CASE WHEN p.side = 'LONG'
                        THEN (s.current_price - p.avg_price) * p.quantity
                        ELSE (p.avg_price - s.current_price) * p.quantity
                    END
                ), 0) as unrealized_pnl
            FROM users u
            LEFT JOIN positions p ON p.user_id = u.id
            LEFT JOIN symbols s ON s.id = p.symbol_id
            GROUP BY u.id, u.username, u.cash_balance, u.created_at
            ORDER BY (u.cash_balance + COALESCE(SUM(p.quantity * s.current_price), 0)) DESC
        `;

        // Get trade counts for all users in one query
        const tradeCounts = await sql`
            SELECT user_id, COUNT(*) as cnt FROM trade_history GROUP BY user_id
        `;
        const tradeCountMap: Record<string, number> = {};
        for (const tc of tradeCounts) {
            tradeCountMap[tc.user_id as string] = Number(tc.cnt);
        }

        const result = rows.map(r => {
            const portfolioValue = Number(r.cash_balance) + Number(r.position_value || 0);
            const returnPct = Math.round(((portfolioValue - 1000) / 1000) * 10000) / 100;
            return {
                username: r.username,
                portfolioValue: Math.round(portfolioValue * 100) / 100,
                totalReturn: returnPct,
                unrealizedPnl: Math.round(Number(r.unrealized_pnl || 0) * 100) / 100,
                tradeCount: tradeCountMap[r.id as string] || 0,
                joinedAt: r.created_at,
            };
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Leaderboard error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
