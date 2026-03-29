import { getSQL } from './db';

const NEWS_TEMPLATES = [
    { headline: '🚀 {ticker} beats earnings expectations by 15%, stock surges', impact: 0.035, type: 'bullish' },
    { headline: '📈 Breaking: {ticker} announces major partnership with tech giant', impact: 0.025, type: 'bullish' },
    { headline: '💰 {ticker} raises full-year guidance, analysts upgrade to BUY', impact: 0.02, type: 'bullish' },
    { headline: '🔬 {ticker} receives FDA approval for groundbreaking treatment', impact: 0.04, type: 'bullish' },
    { headline: '📊 Institutional investors increase {ticker} holdings by 20%', impact: 0.015, type: 'bullish' },
    { headline: '🏆 {ticker} wins $5B government contract', impact: 0.03, type: 'bullish' },
    { headline: '💡 {ticker} unveils revolutionary AI product', impact: 0.025, type: 'bullish' },
    { headline: '📱 {ticker} subscriber growth exceeds Wall Street estimates', impact: 0.02, type: 'bullish' },
    { headline: '🌍 {ticker} expands operations to 15 new markets', impact: 0.018, type: 'bullish' },
    { headline: '💎 Hedge fund legend takes massive position in {ticker}', impact: 0.022, type: 'bullish' },
    { headline: '⚠️ {ticker} misses revenue estimates, shares tumble', impact: -0.035, type: 'bearish' },
    { headline: '🔻 {ticker} CEO resigns amid accounting investigation', impact: -0.045, type: 'bearish' },
    { headline: '📉 Analyst downgrades {ticker} to SELL', impact: -0.02, type: 'bearish' },
    { headline: '⛔ {ticker} faces antitrust lawsuit from DOJ', impact: -0.03, type: 'bearish' },
    { headline: '🏭 {ticker} announces major product recall', impact: -0.025, type: 'bearish' },
    { headline: '💸 {ticker} cuts dividend by 50%', impact: -0.022, type: 'bearish' },
    { headline: '🔒 Data breach at {ticker} exposes 100M records', impact: -0.028, type: 'bearish' },
    { headline: '📋 {ticker} loses key patent case, owes $2B', impact: -0.032, type: 'bearish' },
    { headline: '🏚️ Major client terminates contract with {ticker}', impact: -0.02, type: 'bearish' },
    { headline: '⏰ {ticker} warns of supply chain disruptions', impact: -0.018, type: 'bearish' },
    { headline: '🏦 Fed signals rate pause, markets rally', impact: 0.012, type: 'macro-bull' },
    { headline: '📊 Strong jobs report boosts market confidence', impact: 0.01, type: 'macro-bull' },
    { headline: '🌐 Trade deal breakthrough sends futures higher', impact: 0.015, type: 'macro-bull' },
    { headline: '⚡ Oil prices spike on Middle East tensions', impact: -0.008, type: 'macro-bear' },
    { headline: '🏦 Fed hints at emergency rate hike', impact: -0.015, type: 'macro-bear' },
    { headline: '📉 Recession fears mount as yield curve inverts', impact: -0.012, type: 'macro-bear' },
    { headline: '🛢️ OPEC announces surprise production cut', impact: 0.03, type: 'commodity-bull' },
    { headline: '🥇 Gold hits all-time high as dollar weakens', impact: 0.025, type: 'commodity-bull' },
    { headline: '🛢️ US releases strategic reserves, oil plunges', impact: -0.03, type: 'commodity-bear' },
    { headline: '🏗️ China demand slowdown hits copper hard', impact: -0.025, type: 'commodity-bear' },
];

const EQUITY_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'JNJ', 'WMT', 'DIS', 'HD', 'MA', 'PG'];
const COMMODITY_TICKERS = ['XAUUSD', 'XAGUSD', 'WTIUSD', 'NGUSD', 'XCUUSD'];

export async function generateNewsEvent() {
    if (Math.random() > 0.05) return null;

    const sql = await getSQL();
    const template = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
    let headline = template.headline;
    let affectedTickers: string[] = [];
    let impact = template.impact * (0.7 + Math.random() * 0.6);

    if (template.type === 'bullish' || template.type === 'bearish') {
        const ticker = EQUITY_TICKERS[Math.floor(Math.random() * EQUITY_TICKERS.length)];
        headline = template.headline.replace('{ticker}', ticker);
        affectedTickers = [ticker];
    } else if (template.type === 'macro-bull' || template.type === 'macro-bear') {
        affectedTickers = [...EQUITY_TICKERS];
    } else if (template.type === 'commodity-bull' || template.type === 'commodity-bear') {
        affectedTickers = [...COMMODITY_TICKERS];
    }

    for (const ticker of affectedTickers) {
        const symRows = await sql`SELECT id, current_price, prev_close, day_high, day_low FROM symbols WHERE ticker = ${ticker}`;
        if (symRows.length === 0) continue;
        const sym = symRows[0];
        let newPrice = Number(sym.current_price) * (1 + impact);
        newPrice = Math.max(Number(sym.prev_close) * 0.90, Math.min(Number(sym.prev_close) * 1.10, newPrice));
        newPrice = Math.round(Math.max(0.01, newPrice) * 100) / 100;
        const newDayHigh = Math.max(Number(sym.day_high), newPrice);
        const newDayLow = Math.min(Number(sym.day_low), newPrice);
        await sql`UPDATE symbols SET current_price = ${newPrice}, day_high = ${newDayHigh}, day_low = ${newDayLow} WHERE id = ${sym.id}`;
    }

    const impactPct = Math.round(impact * 10000) / 100;
    await sql`INSERT INTO news_events (headline, type, impact, affected_tickers) VALUES (${headline}, ${template.type}, ${impactPct}, ${affectedTickers.join(',')})`;

    return { headline, type: template.type, impact: impactPct, affectedTickers };
}

export async function getNewsHistory() {
    const sql = await getSQL();
    const rows = await sql`SELECT id, headline, type, impact, affected_tickers, created_at FROM news_events ORDER BY id DESC LIMIT 30`;
    return rows.map(r => ({
        id: r.id,
        headline: r.headline,
        type: r.type,
        impact: r.impact,
        affectedTickers: r.affected_tickers ? r.affected_tickers.split(',') : [],
        timestamp: r.created_at,
    })).reverse();
}
