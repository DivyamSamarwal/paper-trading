import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { tickPrices } from '@/lib/price-engine';

let ticking = false;

export async function GET() {
    // Prevent concurrent ticks from stacking up
    if (ticking) return NextResponse.json({ success: true, skipped: true });
    ticking = true;
    try {
        await initDb();
        await tickPrices();
        return NextResponse.json({ success: true, timestamp: Date.now() });
    } catch (error) {
        console.error('Tick error:', error);
        return NextResponse.json({ error: 'Tick failed' }, { status: 500 });
    } finally {
        ticking = false;
    }
}
