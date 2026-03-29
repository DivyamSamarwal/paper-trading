import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { initDb, getSQL } from '@/lib/db';

// GET — fetch current + recent competitions with entries
export async function GET() {
    try {
        await initDb();
        const sql = await getSQL();

        // Get active competition
        const active = await sql`
            SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY start_time DESC LIMIT 1
        `;

        // Get recent settled competitions (last 10)
        const settled = await sql`
            SELECT * FROM competitions WHERE status = 'SETTLED' ORDER BY end_time DESC LIMIT 10
        `;

        // Get entries for active competition with live portfolio values
        let activeEntries: Record<string, unknown>[] = [];
        if (active.length > 0) {
            activeEntries = await sql`
                SELECT ce.*, u.username, u.cash_balance,
                    COALESCE(SUM(p.quantity * s.current_price), 0) as position_value
                FROM competition_entries ce
                JOIN users u ON u.id = ce.user_id
                LEFT JOIN positions p ON p.user_id = ce.user_id
                LEFT JOIN symbols s ON s.id = p.symbol_id
                WHERE ce.competition_id = ${active[0].id}
                GROUP BY ce.id, ce.user_id, u.username, u.cash_balance
                ORDER BY (u.cash_balance + COALESCE(SUM(p.quantity * s.current_price), 0) - ce.starting_balance) DESC
            `;
        }

        // Get entries for settled competitions
        const settledIds = settled.map(c => c.id);
        let settledEntries: Record<string, unknown>[] = [];
        if (settledIds.length > 0) {
            settledEntries = await sql`
                SELECT ce.*, u.username
                FROM competition_entries ce
                JOIN users u ON u.id = ce.user_id
                WHERE ce.rank IS NOT NULL AND ce.rank <= 5
                ORDER BY ce.competition_id, ce.rank ASC
            `;
        }

        return NextResponse.json({
            active: active[0] || null,
            activeEntries: activeEntries.map(e => ({
                userId: e.user_id,
                username: e.username,
                startingBalance: Number(e.starting_balance),
                currentValue: Number(e.cash_balance) + Number(e.position_value || 0),
                profit: (Number(e.cash_balance) + Number(e.position_value || 0)) - Number(e.starting_balance),
                profitPct: ((Number(e.cash_balance) + Number(e.position_value || 0)) - Number(e.starting_balance)) / Number(e.starting_balance) * 100,
                joinedAt: e.joined_at,
            })),
            settled: settled.map(c => ({
                ...c,
                entries: settledEntries.filter(e => e.competition_id === c.id).map(e => ({
                    username: e.username,
                    profit: Number(e.profit),
                    rank: Number(e.rank),
                    finalBalance: Number(e.final_balance),
                    startingBalance: Number(e.starting_balance),
                })),
            })),
        });
    } catch (error) {
        console.error('Competition GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch competitions' }, { status: 500 });
    }
}

// POST — join the active competition
export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await initDb();
        const sql = await getSQL();

        // Find active competition
        const active = await sql`
            SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY start_time DESC LIMIT 1
        `;
        if (active.length === 0) {
            return NextResponse.json({ error: 'No active competition' }, { status: 400 });
        }

        // Check if already joined
        const existing = await sql`
            SELECT id FROM competition_entries
            WHERE competition_id = ${active[0].id} AND user_id = ${session.user.id}
        `;
        if (existing.length > 0) {
            return NextResponse.json({ error: 'Already joined this competition' }, { status: 400 });
        }

        // Snapshot current portfolio value
        const userRows = await sql`SELECT cash_balance FROM users WHERE id = ${session.user.id}`;
        const positionValue = await sql`
            SELECT COALESCE(SUM(p.quantity * s.current_price), 0) as val
            FROM positions p JOIN symbols s ON s.id = p.symbol_id
            WHERE p.user_id = ${session.user.id}
        `;
        const startingBalance = Number(userRows[0]?.cash_balance || 0) + Number(positionValue[0]?.val || 0);

        const { v4: genuuid } = await import('uuid');
        await sql`
            INSERT INTO competition_entries (id, competition_id, user_id, starting_balance)
            VALUES (${genuuid()}, ${active[0].id}, ${session.user.id}, ${Math.round(startingBalance * 100) / 100})
        `;

        return NextResponse.json({ success: true, startingBalance: Math.round(startingBalance * 100) / 100 });
    } catch (error) {
        console.error('Competition POST error:', error);
        return NextResponse.json({ error: 'Failed to join competition' }, { status: 500 });
    }
}
