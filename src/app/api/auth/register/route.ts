import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getSQL, initDb } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();
        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
        }
        if (password.length < 4) {
            return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
        }

        await initDb();
        const sql = await getSQL();

        // Check if username exists
        const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
        if (existing.length > 0) {
            return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuid();
        const email = `${username.toLowerCase().replace(/\s+/g, '')}@papertrade.local`;

        await sql`INSERT INTO users (id, username, email, password_hash) VALUES (${userId}, ${username}, ${email}, ${hashedPassword})`;

        return NextResponse.json({ success: true, userId });
    } catch (error: any) {
        console.error('Register error:', error);
        return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }
}
