import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getNewsHistory } from '@/lib/news';

export async function GET() {
    try {
        await initDb();
        const news = await getNewsHistory();
        return NextResponse.json(news);
    } catch (error) {
        console.error('News error:', error);
        return NextResponse.json([], { status: 200 });
    }
}
