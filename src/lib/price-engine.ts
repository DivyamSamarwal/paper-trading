import { getSQL, initDb } from './db';
import { updateOptionPrices } from './greeks';
import { generateNewsEvent } from './news';

interface ActiveMomentum {
    forcePerTick: number;
    remainingTicks: number;
}
const activeMomentum: Record<string, ActiveMomentum> = {};

const VOLATILITY: Record<string, number> = {
    EQUITY: 0.0008,
    FUTURE: 0.0012,
    COMMODITY: 0.001,
    OPTION: 0,
};

const RESET_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours

export async function tickPrices() {
    await initDb();
    const sql = await getSQL();

    // Perform Persistent Daily Reset (sync metrics every 8h clock cycle)
    const currentSessionIdx = Math.floor(Date.now() / RESET_INTERVAL).toString();
    const lastResetRows = await sql`SELECT val FROM settings WHERE key = 'last_market_reset'`;
    const lastSessionIdx = lastResetRows[0]?.val;

    if (lastSessionIdx !== currentSessionIdx) {
        await sql`UPDATE symbols SET prev_close = current_price, day_open = current_price, day_high = current_price, day_low = current_price`;
        await sql`INSERT INTO settings (key, val) VALUES ('last_market_reset', ${currentSessionIdx}) 
                  ON CONFLICT(key) DO UPDATE SET val = excluded.val`;
        console.log(`[Price Engine] Daily Reset Performed for Session ${currentSessionIdx}`);
    }

    try {
        const symbols = await sql`SELECT * FROM symbols WHERE asset_type != 'OPTION'`;
        const now = Math.floor(Date.now() / 1000);

        // Batch: fetch ALL recent filled orders in one query instead of per-symbol
        // Cutoff is 2000ms to ensure orders are only counted for 1-2 ticks, preventing artificial 60s price ramping
        const cutoff = new Date(Date.now() - 2000).toISOString();
        const allRecentOrders = await sql`
            SELECT symbol_id, side, quantity FROM orders
            WHERE status = 'FILLED' AND filled_at >= ${cutoff}
        `;

        // Pre-compute order flow per symbol in memory
        const orderFlowMap: Record<string, { netBuy: number; totalVol: number }> = {};
        for (const o of allRecentOrders) {
            const key = o.symbol_id as string;
            if (!orderFlowMap[key]) orderFlowMap[key] = { netBuy: 0, totalVol: 0 };
            orderFlowMap[key].totalVol += Number(o.quantity);
            orderFlowMap[key].netBuy += o.side === 'BUY' ? Number(o.quantity) : -Number(o.quantity);
        }

        for (const sym of symbols) {
            const ticker = sym.ticker as string;
            const momentum = activeMomentum[ticker];
            
            // If active news momentum exists, triple the volatility
            const sigma = (VOLATILITY[sym.asset_type] || 0.0008) * (momentum && momentum.remainingTicks > 0 ? 3 : 1);
            const price = Number(sym.current_price);
            const randomChange = price * sigma * gaussianRandom();

            const flow = orderFlowMap[sym.id as string];
            // Use logarithmic dampening for order flow impact to prevent massive spikes
            const dampenedVol = flow ? Math.log(1 + flow.totalVol) : 0;
            const netRatio = flow && flow.totalVol > 0 ? (flow.netBuy / flow.totalVol) : 0;
            const flowImpact = dampenedVol * netRatio * price * 0.0001;
            const reversion = (Number(sym.base_price) - price) * 0.00005;

            let newsImpact = 0;
            if (momentum && momentum.remainingTicks > 0) {
                newsImpact = price * momentum.forcePerTick;
                momentum.remainingTicks--;
                if (momentum.remainingTicks <= 0) {
                    delete activeMomentum[ticker];
                }
            }

            let newPrice = price + randomChange + flowImpact + reversion + newsImpact;
            const upperCircuit = Number(sym.prev_close) * 1.10;
            const lowerCircuit = Number(sym.prev_close) * 0.90;
            newPrice = Math.max(lowerCircuit, Math.min(upperCircuit, newPrice));
            newPrice = round2(Math.max(0.01, newPrice));

            const open = price;
            const close = newPrice;
            const high = round2(Math.max(open, close) * (1 + Math.random() * 0.0003));
            const low = round2(Math.min(open, close) * (1 - Math.random() * 0.0003));
            const totalVolume = flow ? flow.totalVol : 0;
            // Inject massive random volume if there's active news momentum
            const newsVolume = (newsImpact !== 0) ? Math.floor(Math.random() * 5000) + 2000 : 0;
            const volume = Math.floor(Math.random() * 500) + 50 + totalVolume + newsVolume;

            const newDayHigh = Math.max(Number(sym.day_high), newPrice);
            const newDayLow = Math.min(Number(sym.day_low), newPrice);
            await sql`UPDATE symbols SET current_price = ${newPrice}, day_high = ${newDayHigh}, day_low = ${newDayLow} WHERE id = ${sym.id}`;
            await sql`INSERT INTO price_history (symbol_id, timestamp, open, high, low, close, volume) VALUES (${sym.id}, ${now}, ${round2(open)}, ${high}, ${low}, ${round2(close)}, ${volume})`;
        }

        await updateOptionPrices();
        
        const newsEvent = await generateNewsEvent();
        if (newsEvent) {
            // Apply momentum for 30 ticks (30 seconds)
            const duration = 30;
            // The news event returns impact in percentage (e.g. 3.5 means 3.5%)
            // We need to divide by 100 to get decimal, and by duration to get force per tick
            const forcePerTick = (newsEvent.impact / 100) / duration;
            for (const ticker of newsEvent.affectedTickers) {
                activeMomentum[ticker] = {
                    forcePerTick,
                    remainingTicks: duration
                };
            }
        }
        
        await matchPendingOrders();
        await checkAutoLiquidation();

        // Prune old price_history rows (keep last 10 minutes for snappy queries)
        if (Math.random() < 0.02) {
            const pruneTs = now - 600;
            await sql`DELETE FROM price_history WHERE timestamp < ${pruneTs}`;
        }

        // Competition auto-start / auto-settle (~every 30 seconds)
        if (Math.random() < 0.03) {
            await manageCompetitions(sql);
        }
    } catch (e) {
        console.error("Error in tickPrices:", e);
    }
}

async function matchPendingOrders() {
    const sql = await getSQL();
    const pending = await sql`
        SELECT o.*, s.current_price, s.asset_type, s.margin_req, s.lot_size
        FROM orders o JOIN symbols s ON s.id = o.symbol_id
        WHERE o.status = 'PENDING'
    `;

    for (const order of pending) {
        let shouldFill = false;
        if (order.order_type === 'MARKET') {
            shouldFill = true;
        } else if (order.order_type === 'LIMIT') {
            if (order.side === 'BUY' && order.current_price <= order.price) shouldFill = true;
            if (order.side === 'SELL' && order.current_price >= order.price) shouldFill = true;
        } else if (order.order_type === 'STOP_LOSS') {
            if (order.side === 'SELL' && order.current_price <= order.price) shouldFill = true;
            if (order.side === 'BUY' && order.current_price >= order.price) shouldFill = true;
        }
        if (shouldFill) {
            await executeOrderFill(order.id, order.user_id, order.symbol_id, order.side, order.quantity, order.current_price, order.asset_type, order.margin_req);
        }
    }
}

export async function executeOrderFill(
    orderId: string, userId: string, symbolId: string,
    side: string, quantity: number, currentPrice: number,
    assetType: string, marginReq: number
) {
    const sql = await getSQL();
    const { v4: genuuid } = await import('uuid');

    // Logarithmic slippage: realistic even for very large orders (max ~0.15%)
    const sizePenalty = Math.log(1 + quantity / 500) * 0.00005;
    const slippagePct = 0.0001 + Math.random() * 0.0009 + sizePenalty;
    const slippageDir = side === 'BUY' ? 1 : -1;
    const fillPrice = round2(currentPrice * (1 + slippagePct * slippageDir));
    const commission = round2(1 + fillPrice * quantity * 0.001);
    const totalCost = fillPrice * quantity;
    const marginCost = assetType === 'FUTURE' ? totalCost * marginReq : totalCost;

    const userRows = await sql`SELECT cash_balance FROM users WHERE id = ${userId}`;
    if (userRows.length === 0) return;
    const user = userRows[0];

    // Check if this is closing an existing position (exempt from balance check)
    const posRows = await sql`SELECT * FROM positions WHERE user_id = ${userId} AND symbol_id = ${symbolId}`;
    const existingPos = posRows.length > 0 ? posRows[0] : null;

    let needsMarginCheck = false;
    if (side === 'BUY') {
        const isClosingShort = existingPos && existingPos.side === 'SHORT';
        if (!isClosingShort || quantity > Number(existingPos.quantity)) needsMarginCheck = true;
    } else { // SELL
        const isClosingLong = existingPos && existingPos.side === 'LONG';
        if (!isClosingLong || quantity > Number(existingPos.quantity)) needsMarginCheck = true;
    }

    if (needsMarginCheck && user.cash_balance < marginCost + commission) {
        await sql`UPDATE orders SET status = 'REJECTED' WHERE id = ${orderId}`;
        return;
    }

    // Update order
    const nowIso = new Date().toISOString();
    await sql`UPDATE orders SET status = 'FILLED', filled_price = ${fillPrice}, slippage = ${round2(slippagePct * 100)}, commission = ${commission}, filled_at = ${nowIso} WHERE id = ${orderId}`;

    let realizedPnl = 0;
    let isClosing = false;
    let closedMargin = 0;

    if (existingPos) {
        const posSide = existingPos.side;
        if ((side === 'BUY' && posSide === 'LONG') || (side === 'SELL' && posSide === 'SHORT')) {
            const newQty = existingPos.quantity + quantity;
            const newAvg = round2((existingPos.avg_price * existingPos.quantity + fillPrice * quantity) / newQty);
            const newMargin = assetType === 'FUTURE' ? round2(newAvg * newQty * marginReq) : 0;
            await sql`UPDATE positions SET quantity = ${newQty}, avg_price = ${newAvg}, margin_used = ${newMargin} WHERE id = ${existingPos.id}`;
        } else {
            isClosing = true;
            closedMargin = existingPos.margin_used;
            if (quantity >= existingPos.quantity) {
                realizedPnl = posSide === 'LONG'
                    ? (fillPrice - existingPos.avg_price) * existingPos.quantity
                    : (existingPos.avg_price - fillPrice) * existingPos.quantity;
                await sql`DELETE FROM positions WHERE id = ${existingPos.id}`;
                if (quantity > existingPos.quantity) {
                    const remaining = quantity - existingPos.quantity;
                    const newSide = side === 'BUY' ? 'LONG' : 'SHORT';
                    const newMargin = assetType === 'FUTURE' ? round2(fillPrice * remaining * marginReq) : 0;
                    await sql`INSERT INTO positions (id, user_id, symbol_id, quantity, avg_price, side, margin_used) VALUES (${genuuid()}, ${userId}, ${symbolId}, ${remaining}, ${fillPrice}, ${newSide}, ${newMargin})`;
                }
            } else {
                realizedPnl = posSide === 'LONG'
                    ? (fillPrice - existingPos.avg_price) * quantity
                    : (existingPos.avg_price - fillPrice) * quantity;
                const newQty = existingPos.quantity - quantity;
                const newMargin = assetType === 'FUTURE' ? round2(existingPos.avg_price * newQty * marginReq) : 0;
                closedMargin = existingPos.margin_used - newMargin;
                await sql`UPDATE positions SET quantity = ${newQty}, margin_used = ${newMargin} WHERE id = ${existingPos.id}`;
            }
        }
    } else {
        const posSide = side === 'BUY' ? 'LONG' : 'SHORT';
        const margin = assetType === 'FUTURE' ? round2(fillPrice * quantity * marginReq) : 0;
        await sql`INSERT INTO positions (id, user_id, symbol_id, quantity, avg_price, side, margin_used) VALUES (${genuuid()}, ${userId}, ${symbolId}, ${quantity}, ${fillPrice}, ${posSide}, ${margin})`;
    }

    realizedPnl = round2(realizedPnl);

    // Update cash balance
    if (assetType === 'FUTURE') {
        if (isClosing) {
            const credit = round2(closedMargin + realizedPnl - commission);
            await sql`UPDATE users SET cash_balance = cash_balance + ${credit} WHERE id = ${userId}`;
        } else {
            await sql`UPDATE users SET cash_balance = cash_balance - ${round2(marginCost + commission)} WHERE id = ${userId}`;
        }
    } else {
        // Equity / Spot: simplify cash flow strictly based on transaction side
        if (side === 'BUY') {
            const deduction = round2(totalCost + commission);
            await sql`UPDATE users SET cash_balance = cash_balance - ${deduction} WHERE id = ${userId}`;
        } else {
            const credit = round2(totalCost - commission);
            await sql`UPDATE users SET cash_balance = cash_balance + ${credit} WHERE id = ${userId}`;
        }
    }

    // Trade history
    await sql`INSERT INTO trade_history (id, user_id, symbol_id, side, quantity, price, commission, slippage, realized_pnl) VALUES (${genuuid()}, ${userId}, ${symbolId}, ${side}, ${quantity}, ${fillPrice}, ${commission}, ${round2(slippagePct * 100)}, ${realizedPnl})`;

    // Update volume & nudge price with logarithmic dampening
    await sql`UPDATE symbols SET volume_today = volume_today + ${quantity} WHERE id = ${symbolId}`;
    // Linear impact: 0.01% per 100 shares (much more realistic than log)
    const impact = side === 'BUY' ? quantity * 0.000001 : -quantity * 0.000001;
    // Cap immediate price impact to 0.5% max per trade to prevent massive spikes
    const cappedImpact = Math.max(-0.005, Math.min(0.005, impact));
    const newPrice = round2(Math.max(0.01, currentPrice * (1 + cappedImpact)));
    const symRows = await sql`SELECT day_high, day_low FROM symbols WHERE id = ${symbolId}`;
    if (symRows.length > 0) {
        const newDayHigh = Math.max(Number(symRows[0].day_high), newPrice);
        const newDayLow = Math.min(Number(symRows[0].day_low), newPrice);
        await sql`UPDATE symbols SET current_price = ${newPrice}, day_high = ${newDayHigh}, day_low = ${newDayLow} WHERE id = ${symbolId}`;
    }
}

async function checkAutoLiquidation() {
    const sql = await getSQL();
    const { v4: genuuid } = await import('uuid');

    const futurePositions = await sql`
        SELECT p.*, s.current_price, s.margin_req
        FROM positions p
        JOIN symbols s ON s.id = p.symbol_id
        WHERE s.asset_type = 'FUTURE'
    `;

    for (const pos of futurePositions) {
        const unrealizedPnl = pos.side === 'LONG'
            ? (Number(pos.current_price) - Number(pos.avg_price)) * Number(pos.quantity)
            : (Number(pos.avg_price) - Number(pos.current_price)) * Number(pos.quantity);

        const postedMargin = Number(pos.margin_used);

        // Liquidate only if the unrealized loss has consumed more than 80% of
        // the originally posted margin for THIS position (maintenance margin breach).
        // We deliberately DO NOT look at total cash_balance to avoid false liquidations
        // caused by the user simply spending cash on other assets.
        const remainingMargin = postedMargin + unrealizedPnl;
        const maintenanceThreshold = postedMargin * 0.20; // 20% maintenance margin

        if (remainingMargin <= maintenanceThreshold) {
            const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
            const commission = round2(1 + Number(pos.current_price) * Number(pos.quantity) * 0.001);
            const cashCredit = round2(Math.max(0, remainingMargin) - commission);
            await sql`DELETE FROM positions WHERE id = ${pos.id}`;
            // Credit back whatever margin is left (could be near 0) minus commission
            await sql`UPDATE users SET cash_balance = cash_balance + ${cashCredit} WHERE id = ${pos.user_id}`;
            await sql`INSERT INTO trade_history (id, user_id, symbol_id, side, quantity, price, commission, slippage, realized_pnl)
                VALUES (${genuuid()}, ${pos.user_id}, ${pos.symbol_id}, ${closeSide + '_LIQUIDATION'}, ${Number(pos.quantity)}, ${Number(pos.current_price)}, ${commission}, ${0}, ${round2(unrealizedPnl)})`;
            console.log(`[Liquidation] Position ${pos.id} liquidated. Remaining margin: ${remainingMargin.toFixed(2)}, Posted: ${postedMargin.toFixed(2)}`);
        }
    }
}

async function manageCompetitions(sql: Awaited<ReturnType<typeof getSQL>>) {
    try {
        const { v4: genuuid } = await import('uuid');
        const nowIso = new Date().toISOString();

        // Auto-settle expired ACTIVE competitions
        const expiredComps = await sql`
            SELECT id FROM competitions WHERE status = 'ACTIVE' AND end_time <= ${nowIso}
        `;
        for (const comp of expiredComps) {
            // Compute final portfolio value for each participant
            const entries = await sql`
                SELECT ce.id, ce.user_id, ce.starting_balance, u.cash_balance
                FROM competition_entries ce
                JOIN users u ON u.id = ce.user_id
                WHERE ce.competition_id = ${comp.id}
            `;
            const results: { id: string; finalBalance: number; profit: number }[] = [];
            for (const entry of entries) {
                const posVal = await sql`
                    SELECT COALESCE(SUM(
                        CASE 
                            WHEN s.asset_type = 'FUTURE' THEN
                                p.margin_used + 
                                (CASE WHEN p.side = 'LONG' THEN (s.current_price - p.avg_price) * p.quantity ELSE (p.avg_price - s.current_price) * p.quantity END)
                            WHEN p.side = 'LONG' THEN p.quantity * s.current_price
                            WHEN p.side = 'SHORT' THEN -p.quantity * s.current_price
                            ELSE 0
                        END
                    ), 0) as val
                    FROM positions p JOIN symbols s ON s.id = p.symbol_id
                    WHERE p.user_id = ${entry.user_id}
                `;
                const finalBalance = round2(Number(entry.cash_balance) + Number(posVal[0]?.val || 0));
                const profit = round2(finalBalance - Number(entry.starting_balance));
                results.push({ id: entry.id as string, finalBalance, profit });
            }
            // Rank by profit descending
            results.sort((a, b) => b.profit - a.profit);
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                await sql`UPDATE competition_entries SET final_balance = ${r.finalBalance}, profit = ${r.profit}, rank = ${i + 1} WHERE id = ${r.id}`;
            }
            await sql`UPDATE competitions SET status = 'SETTLED' WHERE id = ${comp.id}`;
            console.log(`[Competition] Settled competition ${comp.id} with ${results.length} participants`);
        }

        // Auto-start: create a new competition if none is ACTIVE
        const activeComps = await sql`SELECT id FROM competitions WHERE status = 'ACTIVE' LIMIT 1`;
        if (activeComps.length === 0) {
            const now = new Date();
            // Start now, end in 8 hours (matching the market cycle)
            const endOffset = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            // Count existing competitions for naming
            const countRows = await sql`SELECT COUNT(*) as c FROM competitions`;
            const compNumber = Number(countRows[0]?.c || 0) + 1;
            const compId = genuuid();
            await sql`
                INSERT INTO competitions (id, name, status, start_time, end_time)
                VALUES (${compId}, ${'Daily Challenge #' + compNumber}, 'ACTIVE', ${now.toISOString()}, ${endOffset.toISOString()})
            `;
            console.log(`[Competition] Started Challenge #${compNumber}, ends at ${endOffset.toISOString()}`);
        }
    } catch (e) {
        console.error('[Competition] Error managing competitions:', e);
    }
}

function gaussianRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
