import { NextRequest, NextResponse } from 'next/server';
import { getSQL, initDb } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        await initDb();
        const sql = await getSQL();
        const type = req.nextUrl.searchParams.get('type') || 'ALL';
        const search = req.nextUrl.searchParams.get('search') || '';

        let rows;
        if (type === 'ALL' && !search) {
            rows = await sql`SELECT * FROM symbols ORDER BY asset_type, ticker`;
        } else if (type === 'ALL') {
            rows = await sql`SELECT * FROM symbols WHERE ticker ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'} ORDER BY asset_type, ticker`;
        } else if (!search) {
            rows = await sql`SELECT * FROM symbols WHERE asset_type = ${type} ORDER BY ticker`;
        } else {
            rows = await sql`SELECT * FROM symbols WHERE asset_type = ${type} AND (ticker ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'}) ORDER BY ticker`;
        }

        return NextResponse.json(rows);
    } catch (error) {
        console.error('Symbols error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
