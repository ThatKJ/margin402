"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPeraWallet, peraClientAvmSigner, isPeraCancellation, type ClientAvmSigner } from "./pera-signer";

/**
 * The customer-agent wallet layer (CLAUDE.md's Layer 1 signer). Pera Wallet
 * is a reference implementation only — a production customer agent calls
 * the same /api/jobs/authorize endpoint directly with its own signer. This
 * context exists purely so a human judge can watch that signing happen.
 *
 * Session restore vs. authorization are deliberately separate actions:
 * reconnectSession() on mount can silently restore a previously-approved
 * Pera session (no prompt), but nothing here ever signs a payment without
 * an explicit user action — see QuoteScreen's "Authorize Live Run".
 */
type WalletStatus = "restoring" | "disconnected" | "connecting" | "connected";

interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  signer: ClientAvmSigner | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("restoring");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disconnectListenerAttached = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wallet = await getPeraWallet();
        const accounts = await wallet.reconnectSession();
        if (cancelled) return;
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setStatus("connected");
        } else {
          setStatus("disconnected");
        }
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "connected" || disconnectListenerAttached.current) return;
    disconnectListenerAttached.current = true;
    void getPeraWallet().then((wallet) => {
      wallet.connector?.on("disconnect", () => {
        setAddress(null);
        setStatus("disconnected");
        disconnectListenerAttached.current = false;
      });
    });
  }, [status]);

  const connect = useCallback(async () => {
    if (status === "connecting" || status === "connected") return;
    setStatus("connecting");
    setError(null);
    try {
      const wallet = await getPeraWallet();
      const accounts = await wallet.connect();
      setAddress(accounts[0] ?? null);
      setStatus(accounts[0] ? "connected" : "disconnected");
    } catch (err) {
      // Pera throws when the user closes the connect modal without picking
      // an account — that's a cancellation, not an error worth surfacing.
      setError(isPeraCancellation(err) ? null : err instanceof Error ? err.message : String(err));
      setStatus("disconnected");
    }
  }, [status]);

  const disconnect = useCallback(async () => {
    try {
      const wallet = await getPeraWallet();
      await wallet.disconnect();
    } finally {
      setAddress(null);
      setStatus("disconnected");
    }
  }, []);

  const signer = useMemo(() => (address ? peraClientAvmSigner(address) : null), [address]);

  const value = useMemo(
    () => ({ status, address, signer, error, connect, disconnect }),
    [status, address, signer, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
