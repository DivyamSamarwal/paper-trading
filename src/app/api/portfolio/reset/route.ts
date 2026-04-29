import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDb } from '@/lib/db';

const STARTING_BALANCE = 10000;

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await initDb();
        const sql = await getSQL();
        const userId = session.user.id;

        // Wipe all open positions
        await sql`DELETE FROM positions WHERE user_id = ${userId}`;

        // Cancel all pending orders
        await sql`UPDATE orders SET status = 'CANCELLED' WHERE user_id = ${userId} AND status = 'PENDING'`;

        // Reset cash balance to starting amount
        await sql`UPDATE users SET cash_balance = ${STARTING_BALANCE} WHERE id = ${userId}`;

        return NextResponse.json({ success: true, newBalance: STARTING_BALANCE });
    } catch (error) {
        console.error('Portfolio reset error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
