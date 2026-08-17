/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MARGIN402 — Main CEO Server (Inbound Revenue Gateway)                 ║
 * ║  File: server.js                                                       ║
 * ║                                                                        ║
 * ║  The primary Hono server on port 3000. Responsibilities:               ║
 * ║  1. x402 inbound payment gate (charges clients 5.00 USDC)             ║
 * ║  2. SSE endpoint (/events) streaming real-time audit logs              ║
 * ║  3. REST API: /api/ledger, /api/orchestrate, /health                   ║
 * ║  4. Static file serving for the Bloomberg Terminal dashboard           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import 'dotenv/config'; // MUST be first — loads .env before any other imports
import { Hono }              from 'hono';
import { cors }              from 'hono/cors';
import { serveStatic }       from '@hono/node-server/serve-static';
import { serve }             from '@hono/node-server';
import { paymentMiddlewareFromConfig } from '@x402-avm/hono';
import { ExactAvmScheme }    from '@x402-avm/avm/exact/server';
import { orchestrateTask, getLedger, logEmitter } from './agent.js';

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT || '3000', 10);
const DEMO_MODE     = process.env.DEMO_MODE === 'true';
const NETWORK       = process.env.NETWORK || 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';
const TREASURY_ADDR = process.env.TREASURY_WALLET_ADDRESS;
const USDC_ASA_ID   = parseInt(process.env.USDC_ASSET_ID || '10458941', 10);

// Safety check: warn if treasury address is missing (non-fatal in DEMO_MODE)
if (!TREASURY_ADDR && !DEMO_MODE) {
  console.warn('\x1b[33m[WARN] TREASURY_WALLET_ADDRESS is not set. x402 inbound payment gate will not work correctly.\x1b[0m');
}

// Use a fallback address for demo mode to prevent SDK crashes
const PAYTO_ADDRESS = TREASURY_ADDR || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

// ─── App Initialization ───────────────────────────────────────────────────────
const app = new Hono();

// Enable CORS for all routes — required for the local frontend to call the API
// and for judges testing from different origins
app.use('*', cors({
  origin:         '*',
  allowMethods:   ['GET', 'POST', 'OPTIONS'],
  allowHeaders:   ['Content-Type', 'Authorization', 'X-Payment', 'Payment-Signature'],
  exposeHeaders:  ['X-Payment-Response', 'Payment-Response', 'Content-Type']
}));

// ─── x402 Inbound Revenue Middleware ─────────────────────────────────────────
/**
 * Protects POST /api/orchestrate with a 5.00 USDC x402 payment requirement.
 *
 * When a client calls this endpoint WITHOUT a valid payment:
 *   → Server responds with HTTP 402 + JSON body containing payment requirements
 *   → Client (or the judge's x402-enabled browser/CLI) pays 5.00 USDC to PAYTO_ADDRESS
 *   → Client retries with PAYMENT-SIGNATURE header
 *   → GoPlausible facilitator verifies the Algorand transaction
 *   → Middleware calls next() and the handler runs
 *
 * In DEMO_MODE: skip the middleware entirely using a bypass query param.
 */
const inboundPaymentMiddleware = DEMO_MODE
  ? async (c, next) => next()  // DEMO: no payment wall
  : paymentMiddlewareFromConfig(
      // Route config: describes what payment this server requires
      {
        accepts: {
          scheme:  'exact',
          network: NETWORK,
          payTo:   PAYTO_ADDRESS,
          price: {
            asset:  USDC_ASA_ID.toString(),
            amount: '5000000'  // 5.00 USDC (5,000,000 micro-USDC)
          }
        }
      },
      undefined,  // Use default HTTPFacilitatorClient (connects to FACILITATOR_URL env var or default)
      [{ network: NETWORK, server: new ExactAvmScheme() }]  // Server-side scheme for verification
    );

// ─── SSE: Real-Time Log Streaming ─────────────────────────────────────────────
/**
 * GET /events — Server-Sent Events endpoint
 *
 * The Bloomberg Terminal dashboard connects to this endpoint on page load
 * and receives a continuous stream of structured log events from the agent.
 *
 * SSE Format (each event is a JSON string):
 * {
 *   "ts":      "2025-01-01T00:00:00.000Z",
 *   "level":   "info" | "success" | "warn" | "error" | "system",
 *   "message": "Human-readable log message",
 *   "data":    { ... optional metadata ... }
 * }
 *
 * The connection stays open indefinitely. The client reconnects automatically
 * via the EventSource API's built-in reconnection logic.
 */
app.get('/events', (c) => {
  // Set SSE headers
  c.header('Content-Type',  'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection',    'keep-alive');
  c.header('X-Accel-Buffering', 'no');  // Disable Nginx buffering if behind a proxy

  // Create a readable stream that stays open and emits log events
  const stream = new ReadableStream({
    start(controller) {
      // Send an initial "connected" event so the client knows the SSE is live
      const welcomeEvent = JSON.stringify({
        ts:      new Date().toISOString(),
        level:   'system',
        message: DEMO_MODE
          ? '🟡 MARGIN402 Bloomberg Terminal — DEMO MODE ACTIVE (No Real Payments)'
          : '🟢 MARGIN402 Bloomberg Terminal — LIVE MODE (Real x402 Payments)'
      });
      controller.enqueue(`data: ${welcomeEvent}\n\n`);

      // Subscribe to the agent's log emitter and forward events to SSE
      const logHandler = (entry) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(entry)}\n\n`);
        } catch {
          // Stream may have been closed by the client disconnecting
        }
      };
      logEmitter.on('log', logHandler);

      // Keep-alive ping every 25 seconds to prevent proxy timeouts
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(`: ping\n\n`);  // SSE comment = keep-alive, ignored by client
        } catch {
          clearInterval(pingInterval);
        }
      }, 25_000);

      // Cleanup when client disconnects
      // Note: Hono/Node.js stream cancellation is best-effort
      return () => {
        logEmitter.off('log', logHandler);
        clearInterval(pingInterval);
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    }
  });
});

// ─── API: Get Current P&L Ledger ──────────────────────────────────────────────
/**
 * GET /api/ledger
 *
 * Returns the current state of the in-memory P&L ledger.
 * Called by the dashboard's CFO panel to display real-time financials.
 *
 * Response schema:
 * {
 *   totalGrossRevenue: number,
 *   totalCOGS:         number,
 *   totalNetProfit:    number,
 *   netProfitMargin:   number,   // 0–100 percentage
 *   requestCount:      number,
 *   transactions:      Array<{ vendor, cost, txId, network, explorerUrl }>
 * }
 */
app.get('/api/ledger', (c) => {
  return c.json({
    success:   true,
    ledger:    getLedger(),
    demoMode:  DEMO_MODE,
    network:   NETWORK,
    treasury:  PAYTO_ADDRESS,
    timestamp: new Date().toISOString()
  });
});

// ─── API: Orchestrate — The Revenue Gateway ───────────────────────────────────
/**
 * POST /api/orchestrate
 *
 * The main revenue-generating endpoint. Protected by the x402 inbound middleware
 * requiring 5.00 USDC payment.
 *
 * Query params:
 *   ?bypass=true  — Skip x402 in DEMO_MODE or for frontend testing
 *                   (Only effective when DEMO_MODE=true)
 *
 * Request body:
 * {
 *   "prompt": "Launch GTM & Legal Audit for DeFi Startup"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "requestId": "REQ-...",
 *   "executiveBrief": "...",
 *   "pnl": { "grossRevenue": 5.00, "totalCOGS": 1.50, "netProfit": 3.50, "netProfitMargin": 70.0 },
 *   "costBreakdown": [...],
 *   "receipts": [...],
 *   "legalVendorSelected": "BetaLegal Express",
 *   "ledgerSnapshot": { ... }
 * }
 */
app.post(
  '/api/orchestrate',
  // Middleware: check bypass flag first, then apply x402 gate
  async (c, next) => {
    const bypass = c.req.query('bypass') === 'true';
    if (bypass || DEMO_MODE) {
      // Log the bypass so it's visible in the terminal
      if (bypass) {
        console.log('\x1b[33m[WARN] 402 bypass activated via ?bypass=true query param\x1b[0m');
      }
      return next();
    }
    // Apply the real x402 payment middleware
    return inboundPaymentMiddleware(c, next);
  },
  // Handler: runs after payment is verified
  async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Request body must be valid JSON with a "prompt" field' }, 400);
    }

    const prompt = body?.prompt?.trim();
    if (!prompt) {
      return c.json({ success: false, error: 'Missing required field: "prompt"' }, 400);
    }

    console.log(`\x1b[35m[Server]\x1b[0m Inbound request (5.00 USDC${DEMO_MODE ? ' DEMO' : ''}) — Prompt: "${prompt.substring(0, 60)}..."`);

    try {
      const result = await orchestrateTask(prompt);
      return c.json({ success: true, ...result });
    } catch (err) {
      console.error('\x1b[31m[Server Error]\x1b[0m', err.message);
      return c.json({ success: false, error: err.message }, 500);
    }
  }
);

// ─── Static Files: Bloomberg Terminal Dashboard ────────────────────────────────
/**
 * Serve the public/ directory containing the Bloomberg Terminal dashboard.
 * index.html is the main entry point.
 *
 * The @hono/node-server serveStatic middleware serves files from the 'public/'
 * directory relative to the current working directory.
 */
app.use('/*', serveStatic({ root: './public' }));

// Fallback: serve index.html for any unmatched route (SPA routing)
app.get('/', (c) => c.redirect('/index.html'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status:   'ok',
    service:  'Margin402 CEO Server',
    demoMode: DEMO_MODE,
    network:  NETWORK,
    treasury: PAYTO_ADDRESS,
    uptime:   process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT }, (info) => {
  const modeColor = DEMO_MODE ? '\x1b[33m' : '\x1b[32m';
  const modeLabel = DEMO_MODE ? 'DEMO MODE  — No Real Payments' : 'LIVE MODE  — Real x402 Payments';

  console.log(`\x1b[32m╔════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[32m║  MARGIN402 CEO Server  →  Port ${info.port}        ║\x1b[0m`);
  console.log(`\x1b[32m╚════════════════════════════════════════════╝\x1b[0m`);
  console.log(`  ${modeColor}${modeLabel}\x1b[0m`);
  console.log(`  Dashboard  →  http://localhost:${info.port}/`);
  console.log(`  API        →  http://localhost:${info.port}/api/orchestrate`);
  console.log(`  Ledger     →  http://localhost:${info.port}/api/ledger`);
  console.log(`  Events     →  http://localhost:${info.port}/events`);
  console.log(`  Treasury   →  ${PAYTO_ADDRESS}`);
});
