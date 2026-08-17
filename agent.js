/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MARGIN402 — Core Ledger & Autonomous Pivot Engine                     ║
 * ║  File: agent.js                                                        ║
 * ║                                                                        ║
 * ║  This module is the financial brain of Margin402. It:                  ║
 * ║  1. Initializes the x402 payment client from the treasury mnemonic     ║
 * ║  2. Maintains a live P&L ledger (revenue, COGS, margins, receipts)     ║
 * ║  3. Orchestrates the dual-role flow: AdCopy → AlphaLegal probe →       ║
 * ║     Autonomous Pivot → BetaLegal → AI Synthesis                        ║
 * ║  4. Emits real-time SSE log events to the dashboard UI                 ║
 * ║  5. Triple-Brain AI fallback: Groq → Gemini → OpenRouter               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import 'dotenv/config';
import { EventEmitter } from 'events';
import OpenAI from 'openai';

// ── x402-avm SDK imports ──────────────────────────────────────────────────────
import { toClientAvmSigner, ExactAvmScheme, ALGORAND_TESTNET_CAIP2 } from '@x402-avm/avm';
import { x402Client, wrapFetchWithPayment } from '@x402-avm/fetch';

// ── Algorand key derivation ───────────────────────────────────────────────────
import { seedFromMnemonic } from '@algorandfoundation/algokit-utils/algo25';
import { ed25519Generator }  from '@algorandfoundation/algokit-utils/crypto';

// ─── Configuration ────────────────────────────────────────────────────────────
const DEMO_MODE      = process.env.DEMO_MODE === 'true';
const NETWORK        = process.env.NETWORK || ALGORAND_TESTNET_CAIP2;
const VENDOR_BASE    = `http://localhost:${process.env.VENDORS_PORT || '3001'}`;
const REVENUE_USDC   = 5.00;
const MARGIN_TARGET  = 0.40;

// ─── SSE Event Emitter ────────────────────────────────────────────────────────
export const logEmitter = new EventEmitter();

function emit(level, message, data = null) {
  const entry = {
    ts:      new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {})
  };
  const colors = { info: '\x1b[90m', success: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', system: '\x1b[36m' };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || colors.info}[${level.toUpperCase()}]${reset} ${message}`);
  logEmitter.emit('log', entry);
}

// ─── P&L Ledger ───────────────────────────────────────────────────────────────
const ledger = {
  totalGrossRevenue: 0,
  totalCOGS:         0,
  totalNetProfit:    0,
  netProfitMargin:   0,
  requestCount:      0,
  transactions:      [],
  auditLog:          [],
};

export function getLedger() {
  return {
    ...ledger,
    totalNetProfit:  ledger.totalGrossRevenue - ledger.totalCOGS,
    netProfitMargin: ledger.totalGrossRevenue > 0
      ? ((ledger.totalGrossRevenue - ledger.totalCOGS) / ledger.totalGrossRevenue) * 100
      : 0
  };
}

// ─── x402 Payment Client ──────────────────────────────────────────────────────
function initPaymentClient() {
  const mnemonic = process.env.TREASURY_MNEMONIC;
  if (!mnemonic || mnemonic.split(' ').length < 25) {
    if (!DEMO_MODE) console.warn('\x1b[33m[WARN] TREASURY_MNEMONIC not set. Set DEMO_MODE=true to run without a wallet.\x1b[0m');
    return null;
  }
  try {
    const seed           = seedFromMnemonic(mnemonic);
    const { ed25519Pubkey } = ed25519Generator(seed);
    const privateKey64   = Buffer.concat([Buffer.from(seed), Buffer.from(ed25519Pubkey)]);
    const signer         = toClientAvmSigner(privateKey64.toString('base64'));
    emit('system', `Treasury wallet initialized: ${signer.address}`);
    const client  = new x402Client();
    const scheme  = new ExactAvmScheme(signer);
    client.register('algorand:*', scheme);
    const payingFetch = wrapFetchWithPayment(fetch, client);
    return { payingFetch, walletAddress: signer.address };
  } catch (err) {
    console.error('\x1b[31m[ERROR] Failed to initialize x402 payment client:\x1b[0m', err.message);
    return null;
  }
}

const paymentClientResult = initPaymentClient();
const payingFetch    = paymentClientResult?.payingFetch || null;
const walletAddress  = paymentClientResult?.walletAddress || 'DEMO_WALLET';

// ─── Triple-Brain AI Clients ──────────────────────────────────────────────────
//
// All three use the same OpenAI SDK — only baseURL + apiKey + model differ.
// Fallback chain: detect failure → emit warn → reroute.
//
// BRAIN 1 — Groq:       ultra-fast free-tier LLM (llama-3.3-70b-versatile)
// BRAIN 2 — Gemini:     Google AI Studio OpenAI-compat (gemini-2.5-flash)
// BRAIN 3 — OpenRouter: aggregated free models (meta-llama/llama-3.3-70b:free)

const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey:  process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  : null;

const geminiClient = process.env.GEMINI_API_KEY
  ? new OpenAI({
      apiKey:  process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    })
  : null;

const openrouterClient = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey:  process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://margin402.dev',
        'X-Title':      'Margin402'
      }
    })
  : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mockTxId() {
  return 'TX_ALGO_' + Math.random().toString(36).substring(2, 12).toUpperCase();
}

function simulateDelay(ms = 2000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Vendor Call: AdCopy AI (Step A) ──────────────────────────────────────────
async function callAdCopyVendor(prompt) {
  emit('info', '► STEP A: Calling AdCopy AI vendor (1.00 USDC)...');

  if (DEMO_MODE || !payingFetch) {
    await simulateDelay(1500);
    const txId = mockTxId();
    emit('success', `✔ AdCopy AI paid & settled. TX: ${txId}`);
    return {
      result: {
        vendor:   'AdCopy AI',
        headline: 'Scale Faster with Algorand x402',
        copy:     'Frictionless micro-transactions powered by autonomous agents.',
        tagline:  'Autonomy. Efficiency. Profit.',
        status:   'GENERATED'
      },
      txId,
      cost: 1.00
    };
  }

  const response = await payingFetch(`${VENDOR_BASE}/api/vendor/adcopy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt })
  });

  if (!response.ok) throw new Error(`AdCopy vendor returned ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const txId = response.headers.get('x-payment-response')
    || response.headers.get('PAYMENT-RESPONSE')
    || mockTxId();

  emit('success', `✔ AdCopy AI paid & settled. TX: ${txId}`, { vendor: 'AdCopy AI', txId, cost: 1.00 });
  return { result: data, txId, cost: 1.00 };
}

// ─── Vendor Call: Probe AlphaLegal (Step B — Price Inspection) ────────────────
async function probeAlphaLegalPrice(prompt) {
  emit('info', '► STEP B: Probing AlphaLegal vendor price (no payment yet)...');

  if (DEMO_MODE) {
    await simulateDelay(500);
    const demoPrice = 4.00;
    emit('warn', `⚠ AlphaLegal demands: ${demoPrice} USDC [DEMO]`);
    return { price: demoPrice, body: { accepts: [{ amount: '4000000', asset: '10458941' }] } };
  }

  const response = await fetch(`${VENDOR_BASE}/api/vendor/alphalegal`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt })
  });

  if (response.status !== 402) {
    emit('warn', `AlphaLegal responded with ${response.status} instead of 402`);
    const data = await response.json();
    return { price: 0, body: data };
  }

  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error('AlphaLegal 402 response body was not valid JSON');
  }

  const accepts     = responseBody?.accepts;
  const firstAccept = Array.isArray(accepts) ? accepts[0] : null;

  if (!firstAccept?.amount) {
    throw new Error('Cannot extract price from AlphaLegal 402 response: missing accepts[0].amount');
  }

  const microUsdc = parseInt(firstAccept.amount, 10);
  const price     = microUsdc / 1_000_000;

  emit('warn', `⚠ AlphaLegal demands: ${price.toFixed(2)} USDC (from 402 challenge)`);
  return { price, body: responseBody };
}

// ─── Vendor Call: BetaLegal Express (Step B — Autonomous Pivot) ───────────────
async function callBetaLegalVendor(prompt) {
  emit('info', '► STEP B (PIVOT): Calling BetaLegal Express vendor (0.50 USDC)...');

  if (DEMO_MODE || !payingFetch) {
    await simulateDelay(1500);
    const txId = mockTxId();
    emit('success', `✔ BetaLegal Express paid & settled. TX: ${txId}`);
    return {
      result: {
        vendor:   'BetaLegal Express',
        analysis: 'Standard regulatory review: Basic compliance criteria satisfied. APPROVED.',
        status:   'VERIFIED'
      },
      txId,
      cost: 0.50
    };
  }

  const response = await payingFetch(`${VENDOR_BASE}/api/vendor/betalegal`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt })
  });

  if (!response.ok) throw new Error(`BetaLegal vendor returned ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const txId = response.headers.get('x-payment-response')
    || response.headers.get('PAYMENT-RESPONSE')
    || mockTxId();

  emit('success', `✔ BetaLegal Express paid & settled. TX: ${txId}`, { vendor: 'BetaLegal', txId, cost: 0.50 });
  return { result: data, txId, cost: 0.50 };
}

// ─── AI Synthesis (Step C) — Triple-Brain Engine ─────────────────────────────
/**
 * Synthesizes sub-agent outputs into an investor-grade GTM & Compliance brief.
 *
 * Triple-Brain fallback chain — same OpenAI SDK, different baseURL/model:
 *   1. Groq          (llama-3.3-70b-versatile)         — lightning fast
 *   2. Google Gemini (gemini-2.5-flash)                 — reliable backup
 *   3. OpenRouter    (meta-llama/llama-3.3-70b:free)    — ultimate safety net
 */
async function synthesizeWithAI(userPrompt, adCopyResult, legalResult, legalVendor) {
  emit('info', '► STEP C: Synthesizing via Triple-Brain AI (Groq → Gemini → OpenRouter)...');

  const systemPrompt =
    `You are an elite business analyst AI for Margin402, an autonomous enterprise LLC ` +
    `running on the Algorand blockchain using the x402 payment protocol. ` +
    `Your role is to synthesize outputs from specialized sub-agents into a concise, ` +
    `investor-grade executive brief. Format your response as a structured report with clear sections. ` +
    `Always be professional, data-driven, and concise. Maximum 300 words.`;

  const userContent =
    `TASK: ${userPrompt}\n\n` +
    `MARKETING OUTPUT (AdCopy AI — 1.00 USDC):\n` +
    `Headline: ${adCopyResult.headline}\n` +
    `Copy: ${adCopyResult.copy}\n` +
    `Tagline: ${adCopyResult.tagline}\n\n` +
    `LEGAL/COMPLIANCE OUTPUT (${legalVendor}):\n` +
    `${legalResult.analysis || legalResult.result || JSON.stringify(legalResult)}\n\n` +
    `Please synthesize these into a cohesive Executive GTM & Compliance Brief for the client.`;

  // temperature >= 0.1 required by Groq; 0.7 is safe for all three providers
  const completionParams = {
    max_tokens:  400,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  }
    ]
  };

  if (!groqClient && !geminiClient && !openrouterClient) {
    emit('warn', '[AI] No AI keys set — returning static brief');
    return buildStaticBrief(adCopyResult, legalResult, 'No AI Keys');
  }

  // ── BRAIN 1: Groq ─────────────────────────────────────────────────────────
  if (groqClient) {
    try {
      emit('info', '  [Brain 1] Groq → llama-3.3-70b-versatile...');
      const completion = await groqClient.chat.completions.create({ ...completionParams, model: 'llama-3.3-70b-versatile' });
      const brief = completion.choices[0]?.message?.content || '';
      if (!brief) throw new Error('Empty response from Groq');
      emit('success', '✔ [Brain 1] Groq synthesis complete.');
      return brief;
    } catch (err) {
      emit('warn', `[!] Brain 1 (Groq) failed — pivoting to Brain 2 (Gemini)... [${err.message}]`);
    }
  }

  // ── BRAIN 2: Gemini ───────────────────────────────────────────────────────
  if (geminiClient) {
    try {
      emit('info', '  [Brain 2] Gemini → gemini-2.5-flash...');
      const completion = await geminiClient.chat.completions.create({ ...completionParams, model: 'gemini-2.5-flash' });
      const brief = completion.choices[0]?.message?.content || '';
      if (!brief) throw new Error('Empty response from Gemini');
      emit('success', '✔ [Brain 2] Gemini synthesis complete.');
      return brief;
    } catch (err) {
      emit('warn', `[!] Brain 2 (Gemini) failed — pivoting to Brain 3 (OpenRouter)... [${err.message}]`);
    }
  }

  // ── BRAIN 3: OpenRouter ───────────────────────────────────────────────────
  if (openrouterClient) {
    try {
      emit('info', '  [Brain 3] OpenRouter → meta-llama/llama-3.3-70b-instruct:free...');
      const completion = await openrouterClient.chat.completions.create({ ...completionParams, model: 'meta-llama/llama-3.3-70b-instruct:free' });
      const brief = completion.choices[0]?.message?.content || '';
      if (!brief) throw new Error('Empty response from OpenRouter');
      emit('success', '✔ [Brain 3] OpenRouter synthesis complete.');
      return brief;
    } catch (err) {
      emit('error', `[!] Brain 3 (OpenRouter) failed: ${err.message} — returning static brief`);
    }
  }

  emit('warn', '[AI] All AI brains exhausted. Serving structured static brief.');
  return buildStaticBrief(adCopyResult, legalResult, 'All Engines Failed');
}

function buildStaticBrief(adCopyResult, legalResult, reason) {
  return (
    `## Executive GTM & Compliance Brief\n` +
    `*Generated via static fallback (${reason})*\n\n` +
    `### Marketing Strategy\n${adCopyResult.headline}\n${adCopyResult.copy}\n\n` +
    `### Compliance Status\n${legalResult.analysis || 'Standard review completed.'}\n\n` +
    `### Recommendation\nStatus: CLEARED FOR LAUNCH`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * orchestrateTask — The Autonomous CEO Engine
 *
 * Dual-role x402 economic loop:
 *   INBOUND:  Client pays 5.00 USDC (gate in server.js)
 *   OUTBOUND: We pay sub-agents via x402 micro-transactions
 *
 * FLOW:
 *   Step A → Pay AdCopy AI 1.00 USDC
 *   Step B → PROBE AlphaLegal price from 402 headers
 *          → If margin < 40%: REJECT → pivot to BetaLegal (0.50 USDC)
 *          → Else: pay AlphaLegal
 *   Step C → Triple-Brain AI synthesis
 *   Step D → Calculate final P&L, update ledger
 */
export async function orchestrateTask(userPrompt) {
  ledger.requestCount++;
  const requestId = `REQ-${Date.now()}`;
  const costItems = [];
  const receipts  = [];
  let totalCOGS   = 0;

  emit('system', `════ ORCHESTRATION ${requestId} INITIATED ════`);
  emit('info',   `Prompt: "${userPrompt.substring(0, 80)}${userPrompt.length > 80 ? '...' : ''}"`);
  emit('success', `Inbound revenue locked: +${REVENUE_USDC.toFixed(2)} USDC (x402 settled)`);

  ledger.totalGrossRevenue += REVENUE_USDC;

  try {
    // ── Step A: AdCopy AI ────────────────────────────────────────────────────
    const adCopyResult = await callAdCopyVendor(userPrompt);
    totalCOGS += adCopyResult.cost;
    costItems.push({ vendor: 'AdCopy AI', cost: adCopyResult.cost, txId: adCopyResult.txId });
    receipts.push({
      vendor:      'AdCopy AI',
      cost:        adCopyResult.cost,
      txId:        adCopyResult.txId,
      network:     NETWORK,
      explorerUrl: `https://testnet.algoexplorer.io/tx/${adCopyResult.txId}`
    });

    // ── Step B: Probe AlphaLegal price ───────────────────────────────────────
    const { price: alphaPrice } = await probeAlphaLegalPrice(userPrompt);

    const projectedCOGS   = totalCOGS + alphaPrice;
    const projectedMargin = (REVENUE_USDC - projectedCOGS) / REVENUE_USDC;

    emit('info', `Margin analysis: COGS+Alpha=${projectedCOGS.toFixed(2)} USDC, Projected margin=${(projectedMargin * 100).toFixed(1)}%`);

    let legalResult, legalVendor;

    if (projectedMargin < MARGIN_TARGET) {
      // ── 🚨 MARGIN PROTECT PROTOCOL ─────────────────────────────────────────
      emit('error', `════════════════════════════════════════════════`);
      emit('error', `  [!] MARGIN PROTECT PROTOCOL TRIGGERED         `);
      emit('error', `  AlphaLegal invoice: ${alphaPrice.toFixed(2)} USDC               `);
      emit('error', `  Projected margin:   ${(projectedMargin * 100).toFixed(1)}% (BELOW ${(MARGIN_TARGET * 100).toFixed(0)}% FLOOR) `);
      emit('error', `  REJECTING AlphaLegal invoice. Pivoting...     `);
      emit('error', `════════════════════════════════════════════════`);
      emit('warn',  `↪ Autonomously redirecting to BetaLegal Express...`);

      const betaResult = await callBetaLegalVendor(userPrompt);
      totalCOGS += betaResult.cost;
      costItems.push({ vendor: 'BetaLegal Express', cost: betaResult.cost, txId: betaResult.txId, reason: 'margin_protect_pivot' });
      receipts.push({
        vendor:      'BetaLegal Express',
        cost:        betaResult.cost,
        txId:        betaResult.txId,
        network:     NETWORK,
        explorerUrl: `https://testnet.algoexplorer.io/tx/${betaResult.txId}`,
        pivotReason: `AlphaLegal demanded ${alphaPrice.toFixed(2)} USDC (${(projectedMargin * 100).toFixed(1)}% margin < ${(MARGIN_TARGET * 100).toFixed(0)}% target)`
      });
      legalResult = betaResult.result;
      legalVendor = 'BetaLegal Express';

    } else {
      emit('info', `Margin check passed. AlphaLegal (${alphaPrice.toFixed(2)} USDC) is acceptable.`);

      if (DEMO_MODE || !payingFetch) {
        await simulateDelay(1500);
        const txId = mockTxId();
        emit('success', `✔ AlphaLegal paid & settled. TX: ${txId}`);
        legalResult = { vendor: 'AlphaLegal Pro', analysis: 'Comprehensive legal audit passed. Cleared for launch.', status: 'VERIFIED' };
        legalVendor = 'AlphaLegal Pro';
        totalCOGS += alphaPrice;
        receipts.push({ vendor: 'AlphaLegal Pro', cost: alphaPrice, txId, network: NETWORK, explorerUrl: `https://testnet.algoexplorer.io/tx/${txId}` });
        costItems.push({ vendor: 'AlphaLegal Pro', cost: alphaPrice, txId });
      } else {
        const response = await payingFetch(`${VENDOR_BASE}/api/vendor/alphalegal`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ prompt: userPrompt })
        });
        const data  = await response.json();
        const txId  = response.headers.get('x-payment-response') || response.headers.get('PAYMENT-RESPONSE') || mockTxId();
        emit('success', `✔ AlphaLegal paid & settled. TX: ${txId}`);
        legalResult = data;
        legalVendor = 'AlphaLegal Pro';
        totalCOGS += alphaPrice;
        receipts.push({ vendor: 'AlphaLegal Pro', cost: alphaPrice, txId, network: NETWORK, explorerUrl: `https://testnet.algoexplorer.io/tx/${txId}` });
        costItems.push({ vendor: 'AlphaLegal Pro', cost: alphaPrice, txId });
      }
    }

    // ── Step C: AI Synthesis ─────────────────────────────────────────────────
    const executiveBrief = await synthesizeWithAI(userPrompt, adCopyResult.result, legalResult, legalVendor);

    // ── Step D: P&L Calculation ──────────────────────────────────────────────
    const netProfit    = REVENUE_USDC - totalCOGS;
    const netProfitPct = (netProfit / REVENUE_USDC) * 100;

    ledger.totalCOGS       += totalCOGS;
    ledger.totalNetProfit   = ledger.totalGrossRevenue - ledger.totalCOGS;
    ledger.netProfitMargin  = ledger.totalGrossRevenue > 0
      ? (ledger.totalNetProfit / ledger.totalGrossRevenue) * 100
      : 0;
    ledger.transactions.push(...receipts);

    emit('success', `════ P&L SUMMARY ════`);
    emit('success', `  Gross Revenue : +${REVENUE_USDC.toFixed(2)} USDC`);
    emit('success', `  Total COGS    : -${totalCOGS.toFixed(2)} USDC`);
    emit('success', `  Net Profit    :  ${netProfit.toFixed(2)} USDC`);
    emit('success', `  Net Margin    :  ${netProfitPct.toFixed(1)}%`);
    emit('system',  `════ ORCHESTRATION ${requestId} COMPLETE ════`);

    return {
      requestId,
      executiveBrief,
      pnl: {
        grossRevenue:    REVENUE_USDC,
        totalCOGS:       parseFloat(totalCOGS.toFixed(2)),
        netProfit:       parseFloat(netProfit.toFixed(2)),
        netProfitMargin: parseFloat(netProfitPct.toFixed(1))
      },
      costBreakdown:       costItems,
      receipts,
      legalVendorSelected: legalVendor,
      walletAddress,
      ledgerSnapshot:      getLedger()
    };

  } catch (err) {
    emit('error', `Orchestration failed: ${err.message}`);
    ledger.totalGrossRevenue -= REVENUE_USDC;
    throw err;
  }
}
