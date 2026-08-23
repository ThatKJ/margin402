"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet/WalletContext";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The wallet control lives in the nav, same rank as any other top-level
 * chip — deliberately not a giant hero element. It's a Testnet signer for
 * the reference customer-agent client, not the product (CLAUDE.md's UI
 * direction: Outcome > Economics > ... > Wallet > Blockchain).
 */
export function WalletControl() {
  const { status, address, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (status === "restoring") {
    return (
      <div className="flex items-center gap-xs rounded-sm border border-line bg-panel px-2.5 py-1 text-label uppercase text-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint" aria-hidden="true" />
        Restoring wallet…
      </div>
    );
  }

  if (status !== "connected" || !address) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={status === "connecting"}
        className="flex items-center gap-1.5 rounded-sm border border-line-strong bg-panel px-2.5 py-1 text-label uppercase text-mute transition-colors hover:border-accent-line hover:text-accent disabled:opacity-60"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-faint" aria-hidden="true" />
        {status === "connecting" ? "Connecting…" : "Connect Pera"}
        {error && <span className="sr-only">{error}</span>}
      </button>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm border border-line bg-panel px-2.5 py-1 text-label uppercase text-mute transition-colors hover:text-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-pass" aria-hidden="true" />
        Testnet
        <span className="tabular text-ink">{truncateAddress(address)}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-xs w-72 rounded-lg border border-line bg-panel p-md shadow-lift">
          <p className="text-label uppercase text-faint">Pera Wallet</p>
          <p className="tabular mt-1 text-body-sm text-ink">{address}</p>
          <div className="mt-sm flex items-center justify-between border-t border-line pt-sm text-body-sm">
            <span className="text-faint">Network</span>
            <span className="text-ink">Algorand Testnet</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-body-sm">
            <span className="text-faint">Role</span>
            <span className="text-ink">Customer Agent Signer</span>
          </div>
          <div className="mt-sm flex flex-col gap-1 border-t border-line pt-sm">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(address)}
              className="rounded-md px-2 py-1.5 text-left text-body-sm text-mute transition-colors hover:bg-panel-2 hover:text-ink"
            >
              Copy address
            </button>
            <a
              href={`https://lora.algokit.io/testnet/account/${address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2 py-1.5 text-left text-body-sm text-mute transition-colors hover:bg-panel-2 hover:text-ink"
            >
              View on Lora ↗
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="rounded-md px-2 py-1.5 text-left text-body-sm text-fail transition-colors hover:bg-fail-dim"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
