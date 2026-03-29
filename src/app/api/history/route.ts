import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDb } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await initDb();
        const sql = await getSQL();
        const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
        const limit = 20;
        const offset = (page - 1) * limit;

        const trades = await sql`
            SELECT t.*, s.ticker, s.name, s.asset_type
            FROM trade_history t JOIN symbols s ON s.id = t.symbol_id
            WHERE t.user_id = ${session.user.id}
            ORDER BY t.timestamp DESC LIMIT ${limit} OFFSET ${offset}
        `;

        const countRows = await sql`SELECT COUNT(*) as total FROM trade_history WHERE user_id = ${session.user.id}`;
        const total = Number(countRows[0]?.total ?? 0);

        const summaryRows = await sql`
            SELECT COALESCE(SUM(realized_pnl), 0) as total_pnl, COALESCE(SUM(commission), 0) as total_commission, COUNT(*) as total_trades
            FROM trade_history WHERE user_id = ${session.user.id}
        `;

        return NextResponse.json({
            trades,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            summary: {
                totalPnl: Math.round(Number(summaryRows[0].total_pnl || 0) * 100) / 100,
                totalCommission: Math.round(Number(summaryRows[0].total_commission || 0) * 100) / 100,
                totalTrades: Number(summaryRows[0].total_trades) || 0,
            },
        });
    } catch (error) {
        console.error('History error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
