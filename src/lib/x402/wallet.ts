import algosdk from "algosdk";

let cached: { privateKeyBase64: string; address: string } | undefined;

/**
 * Derives the raw 64-byte signing key (32-byte seed + 32-byte public key)
 * that @x402/avm's toClientAvmSigner expects, from the 25-word mnemonic in
 * env. Custodial server-side wallet — deliberate, see CLAUDE.md.
 *
 * Deliberately NOT called at module scope anywhere — an invalid/placeholder
 * mnemonic must only fail requests that actually need it, not `next build`
 * or route registration.
 */
export function getTreasurySigner(): { privateKeyBase64: string; address: string } {
  if (cached) return cached;
  const mnemonic = process.env.TREASURY_MNEMONIC;
  if (!mnemonic) {
    throw new Error("TREASURY_MNEMONIC is not set in .env");
  }
  const { sk, addr } = algosdk.mnemonicToSecretKey(mnemonic);
  cached = {
    privateKeyBase64: Buffer.from(sk).toString("base64"),
    address: addr.toString(),
  };
  return cached;
}
