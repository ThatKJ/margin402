import algosdk from "algosdk";
import type { PeraWalletConnect, SignerTransaction } from "@perawallet/connect";

/**
 * Client-side signer interface @x402/avm's ExactAvmScheme expects — copied
 * here rather than imported so this file has zero server-side x402
 * dependencies (this module is browser-only). Shape must stay in sync with
 * @x402/avm's ClientAvmSigner.
 */
export interface ClientAvmSigner {
  address: string;
  signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]>;
}

let instancePromise: Promise<PeraWalletConnect> | null = null;

/**
 * Lazily creates the one PeraWalletConnect instance for this tab — and
 * lazily *imports* the package too, not just the instance. @perawallet/
 * connect injects modal CSS and touches the viewport as a module-level side
 * effect the moment it's evaluated, which (with a static top-level import)
 * ran during the client bundle's initial script evaluation — before React's
 * hydration comparison finished — and mutated <html>'s style attribute out
 * from under it, a real hydration mismatch. A dynamic import here defers
 * that evaluation until this is actually called from an effect or a click
 * handler, safely after hydration.
 */
export function getPeraWallet(): Promise<PeraWalletConnect> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("getPeraWallet() must only be called in the browser"));
  }
  if (!instancePromise) {
    instancePromise = import("@perawallet/connect").then(
      ({ PeraWalletConnect }) => new PeraWalletConnect({ shouldShowSignTxnToast: false }),
    );
  }
  return instancePromise;
}

const CANCELLATION_ERROR_TYPES = new Set([
  "OPERATION_CANCELLED",
  "CONNECT_MODAL_CLOSED",
  "CONNECT_CANCELLED",
  "SIGN_TXN_CANCELLED",
  "SIGN_DATA_CANCELLED",
]);

/**
 * Pera throws a typed PeraWalletConnectError (data.type) for user
 * cancellation, but that class isn't part of the package's public export
 * surface — duck-typing the shape instead of importing it avoids depending
 * on an internal path. True for "the user closed the modal / declined to
 * sign", false for a real connection or settlement failure.
 */
export function isPeraCancellation(error: unknown): boolean {
  const type = (error as { data?: { type?: string } } | undefined)?.data?.type;
  return typeof type === "string" && CANCELLATION_ERROR_TYPES.has(type);
}

/**
 * Builds a ClientAvmSigner backed by a connected Pera account — the
 * customer-agent signer for the demo. Never touches private key material:
 * Pera signs inside its own app/extension and hands back only the signed
 * transaction bytes.
 *
 * indexesToSign follows ClientAvmSigner's contract (sign all if omitted).
 * Entries Pera wasn't asked to sign come back null, in original position,
 * matching what @x402/avm expects when a payment group mixes a fee-sponsor
 * transaction the customer never signs with the one they do.
 */
export function peraClientAvmSigner(address: string): ClientAvmSigner {
  return {
    address,
    async signTransactions(txns, indexesToSign) {
      const indexes = indexesToSign ?? txns.map((_, i) => i);
      const decoded = txns.map((t) => algosdk.decodeUnsignedTransaction(t));
      const group: SignerTransaction[] = decoded.map((txn, i) => ({
        txn,
        signers: indexes.includes(i) ? [address] : [],
      }));

      const wallet = await getPeraWallet();
      const signed = await wallet.signTransaction([group], address);

      const result: (Uint8Array | null)[] = new Array(txns.length).fill(null);
      let cursor = 0;
      for (let i = 0; i < txns.length; i++) {
        if (indexes.includes(i)) {
          result[i] = signed[cursor];
          cursor++;
        }
      }
      return result;
    },
  };
}
