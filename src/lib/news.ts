import { getSQL } from './db';

const NEWS_TEMPLATES = [
    // --- EQUITY BULLISH ---
    { headline: '*{ticker} Q3 EPS $2.14 VS. EST. $1.98; REV. BEATS CONSENSUS', impact: 0.035, type: 'bullish' },
    { headline: '*{ticker} ANNOUNCES $10B SHARE REPURCHASE PROGRAM', impact: 0.025, type: 'bullish' },
    { headline: '*{ticker} UPGRADED TO OUTPERFORM AT MORGAN STANLEY; PT $150', impact: 0.02, type: 'bullish' },
    { headline: '*{ticker} SECURES MULTI-YEAR DEPARTMENT OF DEFENSE CLOUD CONTRACT', impact: 0.03, type: 'bullish' },
    { headline: '*{ticker} SEC FILING SHOWS INSIDER BUYING OF 500K SHARES', impact: 0.015, type: 'bullish' },
    { headline: '*{ticker} ANNOUNCES STRATEGIC ACQUISITION OF COMPETITOR FOR $2.5B', impact: 0.025, type: 'bullish' },
    { headline: '*{ticker} RELEASES NEW GUIDANCE; SEES FY REVENUE +15% YOY', impact: 0.035, type: 'bullish' },
    { headline: '*{ticker} FDA APPROVES EXPANDED USE FOR FLAGSHIP DRUG', impact: 0.04, type: 'bullish' },
    { headline: '*{ticker} ACTIVIST INVESTOR DISCLOSES 5.5% STAKE, PUSHES FOR BOARD CHANGES', impact: 0.028, type: 'bullish' },
    { headline: '*{ticker} PROPOSED DIVIDEND INCREASE OF 15% APPROVED BY BOARD', impact: 0.012, type: 'bullish' },
    { headline: '*{ticker} REPORTS RECORD BREAKING HOLIDAY SALES, BEATS STREET EXPECTATIONS', impact: 0.03, type: 'bullish' },
    { headline: '*{ticker} SHORT INTEREST DROPS SIGNIFICANTLY AMID SHORT SQUEEZE', impact: 0.045, type: 'bullish' },
    { headline: '*{ticker} UNVEILS BREAKTHROUGH AI MODEL; ANALYSTS CITE "GAME CHANGER"', impact: 0.05, type: 'bullish' },
    { headline: '*{ticker} PARTNERS WITH GLOBAL AUTO MAKER FOR NEXT-GEN EV TECH', impact: 0.032, type: 'bullish' },
    { headline: '*{ticker} ADDED TO PRESTIGIOUS S&P 500 INDEX EFFECTIVE NEXT WEEK', impact: 0.04, type: 'bullish' },
    { headline: '*{ticker} SETTLES LONG-RUNNING PATENT DISPUTE FOR $1.2B PAYOUT', impact: 0.025, type: 'bullish' },

    // --- EQUITY BEARISH ---
    { headline: '*{ticker} Q2 REV. $12.4B VS. EST. $13.1B; MISSES EXPECTATIONS', impact: -0.035, type: 'bearish' },
    { headline: '*{ticker} DOWNGRADED TO UNDERWEIGHT AT JPMORGAN; CITES MARGIN PRESSURE', impact: -0.02, type: 'bearish' },
    { headline: '*{ticker} CEO RESIGNS EFFECTIVE IMMEDIATELY AMID BOARD INVESTIGATION', impact: -0.045, type: 'bearish' },
    { headline: '*{ticker} SEC ANNOUNCES FORMAL PROBE INTO ACCOUNTING PRACTICES', impact: -0.04, type: 'bearish' },
    { headline: '*{ticker} HALTS PRODUCTION AT MAIN FACILITY DUE TO SUPPLY CHAIN DISRUPTION', impact: -0.025, type: 'bearish' },
    { headline: '*{ticker} SLASHES QUARTERLY DIVIDEND BY 40% TO PRESERVE CASH', impact: -0.03, type: 'bearish' },
    { headline: '*{ticker} RECALLS 1.2M UNITS CITING POTENTIAL SAFETY DEFECT', impact: -0.028, type: 'bearish' },
    { headline: '*{ticker} FILES FOR CHAPTER 11 BANKRUPTCY PROTECTION IN DELAWARE COURT', impact: -0.08, type: 'bearish' },
    { headline: '*{ticker} LOSES MAJOR CLIENT ACCOUNT REPRESENTING 12% OF REVENUE', impact: -0.032, type: 'bearish' },
    { headline: '*{ticker} WARNS OF Q4 EARNINGS MISS DUE TO WEAK EUROPEAN DEMAND', impact: -0.035, type: 'bearish' },
    { headline: '*{ticker} EXPERIENCES MAJOR DATA BREACH; MILLIONS OF USER RECORDS EXPOSED', impact: -0.025, type: 'bearish' },
    { headline: '*{ticker} CFO DEPARTS UNEXPECTEDLY TO PURSUE OTHER OPPORTUNITIES', impact: -0.018, type: 'bearish' },
    { headline: '*{ticker} HIT WITH $800M ANTITRUST FINE BY EU REGULATORS', impact: -0.038, type: 'bearish' },
    { headline: '*{ticker} PROPOSED MEGA-MERGER BLOCKED BY FTC CITING MONOPOLY CONCERNS', impact: -0.042, type: 'bearish' },
    { headline: '*{ticker} ANALYST WARNS OF "IMPENDING INVENTORY GLUT" HEADING INTO HOLIDAYS', impact: -0.022, type: 'bearish' },
    { headline: '*{ticker} MAJOR UNION CALLS FOR INDEFINITE STRIKE STARTING MONDAY', impact: -0.028, type: 'bearish' },

    // --- MACRO BULLISH ---
    { headline: '*U.S. NON-FARM PAYROLLS +250K VS. EST. +180K; UNEMPLOYMENT FALLS TO 3.5%', impact: 0.015, type: 'macro-bull' },
    { headline: '*FOMC KEEPS TARGET RATE UNCHANGED; POWELL SIGNALS POTENTIAL CUTS IN Q4', impact: 0.02, type: 'macro-bull' },
    { headline: '*U.S. CPI YOY 2.1% VS EST. 2.3%; INFLATION COOLING FASTER THAN EXPECTED', impact: 0.018, type: 'macro-bull' },
    { headline: '*SENATE PASSES $1.2T INFRASTRUCTURE STIMULUS BILL', impact: 0.012, type: 'macro-bull' },
    { headline: '*U.S. RETAIL SALES +1.2% MOM VS. EST. +0.4%', impact: 0.01, type: 'macro-bull' },
    { headline: '*EUROZONE GDP GROWS 0.5% AVERTING TECHNICAL RECESSION', impact: 0.008, type: 'macro-bull' },
    { headline: '*CONSUMER CONFIDENCE SURGES TO HIGHEST LEVEL IN 2 YEARS', impact: 0.012, type: 'macro-bull' },
    { headline: '*CHINA ANNOUNCES SURPRISE MONETARY STIMULUS MEASURES; PBOC CUTS RRR', impact: 0.015, type: 'macro-bull' },
    { headline: '*GLOBAL MANUFACTURING PMI CROSSES ABOVE 50, SIGNALING EXPANSION', impact: 0.011, type: 'macro-bull' },
    { headline: '*HOUSING STARTS BEAT ESTIMATES BY 12%; BUILDER CONFIDENCE REBOUNDS', impact: 0.009, type: 'macro-bull' },

    // --- MACRO BEARISH ---
    { headline: '*U.S. CPI YOY 4.2% VS EST. 3.8%; CORE INFLATION ACCELERATES', impact: -0.02, type: 'macro-bear' },
    { headline: '*FOMC RAISES TARGET RATE BY 50 BPS; POWELL CITES PERSISTENT INFLATION', impact: -0.025, type: 'macro-bear' },
    { headline: '*U.S. GDP Q1 INITIAL READING -0.5% VS EST. +1.2%; RECESSION FEARS MOUNT', impact: -0.018, type: 'macro-bear' },
    { headline: '*CONSUMER CONFIDENCE INDEX PLUMMETS TO 5-YEAR LOW', impact: -0.012, type: 'macro-bear' },
    { headline: '*YIELD CURVE INVERTS FURTHER; 2YR/10YR SPREAD WIDENS TO -80 BPS', impact: -0.015, type: 'macro-bear' },
    { headline: '*EXISTING HOME SALES FALL 4.5% AS MORTGAGE RATES HIT NEW HIGHS', impact: -0.01, type: 'macro-bear' },
    { headline: '*U.S. INITIAL JOBLESS CLAIMS SPIKE TO 300K VS EST. 250K', impact: -0.014, type: 'macro-bear' },
    { headline: '*SOVEREIGN DEBT DOWNGRADED BY FITCH; CITES GROWING DEFICIT CONCERNS', impact: -0.022, type: 'macro-bear' },
    { headline: '*SUDDEN COLLAPSE OF MID-SIZED REGIONAL BANK SPARKS CONTAGION FEARS', impact: -0.03, type: 'macro-bear' },
    { headline: '*PCE INFLATION REPORT COMES IN HOT; MARKETS PRICING OUT RATE CUTS', impact: -0.019, type: 'macro-bear' },

    // --- COMMODITY BULLISH ---
    { headline: '*OPEC+ SURPRISE DECISION: CRUDE PRODUCTION CUT BY 1.5M BPD', impact: 0.035, type: 'commodity-bull' },
    { headline: '*U.S. STRATEGIC PETROLEUM RESERVE REFILL ANNOUNCED', impact: 0.02, type: 'commodity-bull' },
    { headline: '*GEOPOLITICAL TENSIONS ESCALATE IN MIDDLE EAST; SUPPLY ROUTE THREATENED', impact: 0.04, type: 'commodity-bull' },
    { headline: '*GLOBAL COPPER INVENTORIES HIT 10-YEAR LOW ON STRONG CHINESE DEMAND', impact: 0.025, type: 'commodity-bull' },
    { headline: '*DOLLAR INDEX (DXY) FALLS 1.5%; PRECIOUS METALS CATCH BID', impact: 0.015, type: 'commodity-bull' },
    { headline: '*MAJOR MINE STRIKE IN CHILE HALTS 15% OF GLOBAL LITHIUM PRODUCTION', impact: 0.03, type: 'commodity-bull' },
    { headline: '*SEVERE DROUGHT CONDITIONS IN MIDWEST THREATEN CORN AND SOYBEAN YIELDS', impact: 0.035, type: 'commodity-bull' },
    { headline: '*UNEXPECTED FREEZE IN BRAZIL DEVASTATES COFFEE AND SUGAR CROPS', impact: 0.028, type: 'commodity-bull' },
    { headline: '*RUSSIA SUSPENDS BLACK SEA GRAIN EXPORT DEAL', impact: 0.04, type: 'commodity-bull' },
    { headline: '*U.S. NATURAL GAS EXPORTS TO EUROPE HIT RECORD HIGHS AHEAD OF WINTER', impact: 0.022, type: 'commodity-bull' },

    // --- COMMODITY BEARISH ---
    { headline: '*OPEC+ AGREES TO INCREASE PRODUCTION TARGETS STARTING NEXT MONTH', impact: -0.03, type: 'commodity-bear' },
    { headline: '*U.S. CRUDE INVENTORIES +8.4M BARRELS VS EST. +1.2M', impact: -0.02, type: 'commodity-bear' },
    { headline: '*CHINA MANUFACTURING PMI MISSES EXPECTATIONS; COMMODITY DEMAND OUTLOOK WEAKENS', impact: -0.025, type: 'commodity-bear' },
    { headline: '*U.S. DOLLAR INDEX (DXY) RALLIES TO 6-MONTH HIGH', impact: -0.015, type: 'commodity-bear' },
    { headline: '*RUSSIA SIGNALS WILLINGNESS TO EASE EXPORT RESTRICTIONS ON ENERGY PRODUCTS', impact: -0.028, type: 'commodity-bear' },
    { headline: '*WARM WINTER WEATHER FORECAST DULLS NATURAL GAS DEMAND EXPECTATIONS', impact: -0.022, type: 'commodity-bear' },
    { headline: '*BUMPER CROP HARVEST EXPECTED IN U.S. MIDWEST; WHEAT PROJECTIONS UP 15%', impact: -0.035, type: 'commodity-bear' },
    { headline: '*NEW MINE DISCOVERY IN AUSTRALIA SET TO FLOOD GLOBAL IRON ORE MARKET', impact: -0.025, type: 'commodity-bear' },
    { headline: '*EV ADOPTION SLOWS; BATTERY METALS SEE SHARP DECLINE IN SPOT PRICES', impact: -0.02, type: 'commodity-bear' },
    { headline: '*INDIA ANNOUNCES BAN ON RICE EXPORTS LIFTED, EASING GLOBAL FOOD PRICES', impact: -0.03, type: 'commodity-bear' }
];

const EQUITY_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'JNJ', 'WMT', 'DIS', 'HD', 'MA', 'PG'];
const COMMODITY_TICKERS = ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'WTIUSD', 'NGUSD', 'XCUUSD', 'WHEAT', 'CORN', 'SOYBEAN', 'COTTON'];
const FUTURE_TICKERS = ['ES', 'NQ', 'YM', 'RTY', 'CL', 'GC', 'SI', 'HG', 'NG', 'ZB', 'ZN', 'ZC', 'ZW', 'ZS'];

export async function generateNewsEvent() {
    // 1.5% chance per second (~1 event every 66 seconds on average across the whole market)
    if (Math.random() > 0.015) return null;

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
        // Macro events affect all Equities and all Futures (Indices, Treasuries, etc.)
        affectedTickers = [...EQUITY_TICKERS, ...FUTURE_TICKERS];
    } else if (template.type === 'commodity-bull' || template.type === 'commodity-bear') {
        // Commodity events affect all spot commodities
        affectedTickers = [...COMMODITY_TICKERS];
    }

    // We no longer instantly update the database here.
    // The price-engine will use the returned impact to simulate momentum over time.

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
