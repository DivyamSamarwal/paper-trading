import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDb } from '@/lib/db';
import { executeOrderFill } from '@/lib/price-engine';
import { v4 as uuid } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { symbolId, side, orderType, quantity, price } = await req.json();
        if (!symbolId || !side || !orderType || !quantity) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        if (!['BUY', 'SELL'].includes(side)) return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
        if (!['MARKET', 'LIMIT', 'STOP_LOSS'].includes(orderType)) return NextResponse.json({ error: 'Invalid order type' }, { status: 400 });
        const qty = parseInt(quantity, 10);
        if (!Number.isFinite(qty) || qty <= 0 || qty !== Number(quantity)) {
            return NextResponse.json({ error: 'Quantity must be a positive integer' }, { status: 400 });
        }

        await initDb();
        const sql = await getSQL();

        const symRows = await sql`SELECT * FROM symbols WHERE id = ${symbolId}`;
        if (symRows.length === 0) return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
        const symbol = symRows[0];
        const symbolCurrentPrice = Number(symbol.current_price);
        const symbolMarginReq = Number(symbol.margin_req);

        // Validate sell
        if (side === 'SELL') {
            const posRows = await sql`SELECT * FROM positions WHERE user_id = ${session.user.id} AND symbol_id = ${symbolId}`;
            if (posRows.length === 0 && symbol.asset_type !== 'FUTURE' && symbol.asset_type !== 'COMMODITY') {
                return NextResponse.json({ error: 'No position to sell. Short selling only for Futures and Commodities.' }, { status: 400 });
            }
        }

        const orderId = uuid();
        const orderPrice = orderType === 'MARKET' ? symbolCurrentPrice : price;

        if ((orderType === 'LIMIT' || orderType === 'STOP_LOSS') && !price) {
            return NextResponse.json({ error: 'Price required for limit/stop-loss orders' }, { status: 400 });
        }

        // Check balance for buy orders (skip if closing short)
        if (side === 'BUY') {
            const posRows = await sql`SELECT side, quantity FROM positions WHERE user_id = ${session.user.id} AND symbol_id = ${symbolId}`;
            const existingPos = posRows.length > 0 ? posRows[0] : null;
            const isClosingShort = existingPos && existingPos.side === 'SHORT' && quantity <= Number(existingPos.quantity);

            if (!isClosingShort) {
                const userRows = await sql`SELECT cash_balance FROM users WHERE id = ${session.user.id}`;
                if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 401 });
                const cost = symbol.asset_type === 'FUTURE' ? symbolCurrentPrice * quantity * symbolMarginReq : symbolCurrentPrice * quantity;
                const commission = 1 + cost * 0.001;
                if (Number(userRows[0].cash_balance) < cost + commission) {
                    return NextResponse.json({ error: 'Insufficient funds' }, { status: 400 });
                }
            }
        }

        await sql`INSERT INTO orders (id, user_id, symbol_id, side, order_type, quantity, price, status) VALUES (${orderId}, ${session.user.id}, ${symbolId}, ${side}, ${orderType}, ${qty}, ${orderPrice}, 'PENDING')`;

        // MARKET orders are now picked up by the async ticker loop to prevent blocking the HTTP response

        return NextResponse.json({ success: true, orderId });
    } catch (error) {
        console.error('Trade error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const orderId = req.nextUrl.searchParams.get('orderId');
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

        await initDb();
        const sql = await getSQL();
        await sql`UPDATE orders SET status = 'CANCELLED' WHERE id = ${orderId} AND user_id = ${session.user.id} AND status = 'PENDING'`;
        const check = await sql`SELECT status FROM orders WHERE id = ${orderId} AND user_id = ${session.user.id}`;
        if (check.length === 0 || check[0].status !== 'CANCELLED') {
            return NextResponse.json({ error: 'Order not found or already filled' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Cancel order error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
