import "dotenv/config";
import algosdk from "algosdk";
import { getTreasurySigner } from "../src/lib/x402/wallet";

/**
 * One-time setup: opts the treasury wallet into testnet USDC (ASA 10458941)
 * so it can receive the faucet transfer and later pay providers with it.
 * Algorand requires an explicit opt-in (a 0-amount asset transfer to self)
 * before an account can hold any asset — this is that transaction, signed
 * locally with the mnemonic already in .env. Needs a few ALGO in the wallet
 * first to cover the fee.
 *
 * Usage: `npx tsx scripts/opt-in-usdc.ts`
 */

const USDC_ASA_ID = 10458941;
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";

async function main() {
  const { privateKeyBase64, address } = getTreasurySigner();
  const sk = Buffer.from(privateKeyBase64, "base64");

  const algod = new algosdk.Algodv2("", ALGOD_URL, "");

  const account = await algod.accountInformation(address).do();
  const alreadyOptedIn = (account.assets ?? []).some((a) => Number(a.assetId) === USDC_ASA_ID);
  if (alreadyOptedIn) {
    console.log(`[opt-in-usdc] ${address} is already opted into asset ${USDC_ASA_ID} — nothing to do.`);
    return;
  }

  console.log(`[opt-in-usdc] opting ${address} into testnet USDC (asset ${USDC_ASA_ID})...`);

  const suggestedParams = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    assetIndex: USDC_ASA_ID,
    suggestedParams,
  });

  const signedTxn = txn.signTxn(sk);
  const { txid } = await algod.sendRawTransaction(signedTxn).do();
  console.log(`[opt-in-usdc] submitted ${txid}, waiting for confirmation...`);

  await algosdk.waitForConfirmation(algod, txid, 4);

  console.log(`[opt-in-usdc] confirmed. ${address} is now opted into asset ${USDC_ASA_ID}.`);
  console.log(`[opt-in-usdc] verify: https://lora.algokit.io/testnet/transaction/${txid}`);
}

main().catch((err) => {
  console.error("[opt-in-usdc] failed:", err);
  process.exit(1);
});
