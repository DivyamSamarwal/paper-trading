import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getSQL, initDb } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                username: { label: 'Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null;
                await initDb();
                const sql = await getSQL();
                const rows = await sql`SELECT * FROM users WHERE username = ${credentials.username as string}`;
                if (rows.length === 0) return null;
                const user = rows[0];
                const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
                if (!valid) return null;
                return { id: user.id, name: user.username, email: user.email };
            },
        }),
    ],
    callbacks: {
        jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        session({ session, token }) {
            if (session.user) session.user.id = token.id as string;
            return session;
        },
    },
    pages: { signIn: '/login' },
    session: { strategy: 'jwt' },
    secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
});
