/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MARGIN402 — Mock Vendor Ecosystem (Sub-Agent APIs)                    ║
 * ║  File: mock-vendors.js                                                 ║
 * ║                                                                        ║
 * ║  A standalone Hono server on port 3001 exposing three x402-protected   ║
 * ║  micro-service endpoints that simulate specialized sub-agent APIs.     ║
 * ║                                                                        ║
 * ║  VENDOR ROSTER:                                                        ║
 * ║  • /api/vendor/alphalegal  — 4.00 USDC (Price-Gouger)                 ║
 * ║  • /api/vendor/betalegal   — 0.50 USDC (Cheap Backup)                 ║
 * ║  • /api/vendor/adcopy      — 1.00 USDC (Marketing Generator)          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import 'dotenv/config'; // CRITICAL: load .env at the absolute top before any other imports
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { paymentMiddlewareFromConfig } from '@x402-avm/hono';
import { ExactAvmScheme } from '@x402-avm/avm/exact/server';

// ─── Constants ────────────────────────────────────────────────────────────────
const VENDOR_PORT  = parseInt(process.env.VENDORS_PORT || '3001', 10);
const DEMO_MODE    = process.env.DEMO_MODE === 'true';

// The address that receives vendor payments.
// In a real deployment each vendor would have their own wallet.
// For this demo they all pay to the treasury (same entity).
const VENDOR_RECEIVER = process.env.TREASURY_WALLET_ADDRESS || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

const USDC_ASA_ID = parseInt(process.env.USDC_ASSET_ID || '10458941', 10);
const NETWORK     = process.env.NETWORK || 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = new Hono();

// Allow CORS from all origins so the main server & frontend can call these APIs
app.use('*', cors());

// ─── Helper: build x402 payment middleware config ─────────────────────────────
/**
 * Creates a reusable Hono x402 payment middleware for a given price in micro-USDC.
 *
 * The `paymentMiddlewareFromConfig` function accepts:
 *   1. routes  — a route config object with `accepts` payment requirements
 *   2. facilitatorClients — null/undefined uses the default GoPlausible facilitator
 *   3. schemes — array of { network, server } objects providing the scheme implementation
 *
 * @param {number} microUsdc - Price in micro-USDC (1 USDC = 1_000_000 micro-USDC)
 * @returns Hono middleware function
 */
function buildPaymentMiddleware(microUsdc) {
  // In DEMO_MODE we skip real x402 verification — return a pass-through middleware
  if (DEMO_MODE) {
    return async (c, next) => {
      console.log(`  [DEMO] Skipping 402 verification for ${microUsdc / 1e6} USDC`);
      return next();
    };
  }

  // Route config: the `accepts` key describes the payment requirements the server advertises
  // in the 402 response body. The x402-avm SDK will include these in the WWW-Authenticate
  // style payload that the client parses before constructing its payment transaction.
  const routeConfig = {
    accepts: {
      scheme:  'exact',                // ExactAvmScheme: one-shot ASA transfer
      network: NETWORK,                // Algorand Testnet CAIP-2
      payTo:   VENDOR_RECEIVER,        // Algorand address receiving the USDC
      price: {
        asset:  USDC_ASA_ID.toString(), // ASA ID as string (required by SDK)
        amount: microUsdc.toString()    // Micro-USDC amount as string
      }
    }
  };

  // The ExactAvmScheme (server) handles verifying the Algorand ASA transfer transaction
  // that the client constructs and signs. The facilitator (GoPlausible) acts as the
  // settlement layer, broadcasting and confirming the transaction on-chain.
  return paymentMiddlewareFromConfig(
    routeConfig,
    undefined,                                                    // Use default HTTPFacilitatorClient
    [{ network: NETWORK, server: new ExactAvmScheme() }]          // Server-side scheme registration
  );
}

// ─── Vendor 1: AlphaLegal Pro — 4.00 USDC (Price Gouger) ─────────────────────
/**
 * AlphaLegal Pro charges a premium 4.00 USDC for "comprehensive" legal analysis.
 * This vendor exists to TRIGGER the Margin Protect Protocol.
 *
 * When the agent probes this endpoint WITHOUT a payment header, it receives a
 * 402 response. The agent inspects the price from the response body and calculates
 * that paying 4.00 USDC would drop the profit margin to 0% (5.00 revenue - 1.00 AdCopy - 4.00 = 0.00).
 * This triggers the autonomous pivot to BetaLegal.
 *
 * Price: 4,000,000 micro-USDC = 4.00 USDC
 */
app.post(
  '/api/vendor/alphalegal',
  buildPaymentMiddleware(4_000_000),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt || 'Generic legal task';

    console.log(`  [AlphaLegal] Processing paid request: "${prompt.substring(0, 60)}..."`);

    return c.json({
      vendor:   'AlphaLegal Pro',
      analysis: 'Comprehensive legal audit: Passed all SEC & compliance checks with zero critical vulnerabilities. ' +
                'Entity structure validated. IP assignments reviewed. Regulatory exposure: MINIMAL. ' +
                'Recommendation: CLEARED for institutional fundraise.',
      status:   'VERIFIED',
      cost_usdc: 4.00,
      timestamp: new Date().toISOString()
    });
  }
);

// ─── Vendor 2: BetaLegal Express — 0.50 USDC (Low-Cost Backup) ───────────────
/**
 * BetaLegal Express is the cheap alternative vendor activated when AlphaLegal
 * threatens to crater our profit margin.
 *
 * Combined COGS after pivot: 1.00 (AdCopy) + 0.50 (BetaLegal) = 1.50 USDC
 * Net Profit: 5.00 - 1.50 = 3.50 USDC → Margin = 3.50 / 5.00 = 70.0% ✅
 *
 * Price: 500,000 micro-USDC = 0.50 USDC
 */
app.post(
  '/api/vendor/betalegal',
  buildPaymentMiddleware(500_000),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt || 'Generic legal task';

    console.log(`  [BetaLegal] Processing paid request: "${prompt.substring(0, 60)}..."`);

    return c.json({
      vendor:   'BetaLegal Express',
      analysis: 'Standard regulatory review: Basic compliance criteria satisfied. ' +
                'Corporate structure is sound. No immediate red flags identified. ' +
                'Recommendation: APPROVED for Series A due diligence.',
      status:   'VERIFIED',
      cost_usdc: 0.50,
      timestamp: new Date().toISOString()
    });
  }
);

// ─── Vendor 3: AdCopy AI — 1.00 USDC (Marketing Generator) ──────────────────
/**
 * AdCopy AI generates marketing materials. This is ALWAYS the first vendor called
 * as part of the standard orchestration flow (Step A).
 *
 * It establishes the baseline COGS before the legal vendor selection occurs.
 * The 1.00 USDC cost is paid automatically by the agent via wrapFetchWithPayment.
 *
 * Price: 1,000,000 micro-USDC = 1.00 USDC
 */
app.post(
  '/api/vendor/adcopy',
  buildPaymentMiddleware(1_000_000),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt || 'Generic marketing task';

    console.log(`  [AdCopy AI] Processing paid request: "${prompt.substring(0, 60)}..."`);

    return c.json({
      vendor:    'AdCopy AI',
      headline:  'Scale Faster with Algorand x402',
      copy:      'Frictionless micro-transactions powered by autonomous agents. ' +
                 'Zero subscriptions. Pay-per-use intelligence at machine speed. ' +
                 'The future of enterprise software is here — and it pays for itself.',
      tagline:   'Autonomy. Efficiency. Profit.',
      status:    'GENERATED',
      cost_usdc: 1.00,
      timestamp: new Date().toISOString()
    });
  }
);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status:    'ok',
    service:   'Margin402 Mock Vendor Ecosystem',
    demoMode:  DEMO_MODE,
    vendors:   ['alphalegal (4.00 USDC)', 'betalegal (0.50 USDC)', 'adcopy (1.00 USDC)'],
    timestamp: new Date().toISOString()
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: VENDOR_PORT }, (info) => {
  const mode = DEMO_MODE ? ' \x1b[33m[DEMO MODE — No Real Payments]\x1b[0m' : '';
  console.log(`\x1b[36m╔════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[36m║  Mock Vendor Ecosystem  →  Port ${info.port}       ║\x1b[0m`);
  console.log(`\x1b[36m╚════════════════════════════════════════════╝\x1b[0m`);
  console.log(`  \x1b[31m/api/vendor/alphalegal\x1b[0m  — 4.00 USDC (Price Gouger)`);
  console.log(`  \x1b[32m/api/vendor/betalegal\x1b[0m   — 0.50 USDC (Cheap Backup)`);
  console.log(`  \x1b[32m/api/vendor/adcopy\x1b[0m      — 1.00 USDC (Marketing AI)`);
  console.log(mode);
});
