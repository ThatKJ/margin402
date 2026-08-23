import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";

/**
 * Algorand TESTNET — required by the hackathon's final evaluation criteria
 * (judges verify a real x402 transaction on Algorand Testnet via Lora).
 * Was mainnet through Prompt 1-4; switched on explicit instruction.
 *
 * The GoPlausible facilitator's /supported endpoint advertises Algorand
 * networks as the full genesis-hash CAIP-2 form
 * ("algorand:SGO1GK...xi9/cOUJOiI="), not @x402/avm's shorter
 * ALGORAND_TESTNET_CAIP2 constant. Route registration must match what the
 * facilitator reports exactly or x402ResourceServer's startup sync throws
 * RouteConfigurationError, so this is built from the genesis hash rather
 * than using the mismatched constant. Confirmed directly against the live
 * facilitator: testnet is supported with fee sponsorship, same as mainnet.
 */
export const ALGORAND_NETWORK = `algorand:${ALGORAND_TESTNET_GENESIS_HASH}`;
