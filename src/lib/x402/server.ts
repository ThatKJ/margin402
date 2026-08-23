import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ALGORAND_NETWORK } from "./network";

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://facilitator.goplausible.xyz",
});

/** Shared x402 resource server for every provider route in this app. */
export const resourceServer = new x402ResourceServer(facilitatorClient).register(
  ALGORAND_NETWORK,
  new ExactAvmScheme(),
);
