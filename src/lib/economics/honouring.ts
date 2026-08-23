import { toCents, toDollars, formatUsd } from "./money";
import type { HonouringEvaluation } from "./types";

/**
 * The honouring rule: reached only when the selected strategy failed the
 * affordability check — i.e. this is the only viable path left, and it
 * costs more than what remains of the budget. Compares the loss from paying
 * anyway against the loss from refunding, and pays while paying is cheaper.
 * Delivering at a loss beats refunding.
 *
 *   lossFromPaying    = (spentSoFar + price) - revenue   (negative = still profitable)
 *   lossFromRefunding = spentSoFar + revenue              (sunk cost, plus the refund itself)
 */
export function applyHonouringRule(args: {
  spentSoFar: number;
  price: number;
  revenue: number;
}): HonouringEvaluation {
  const spentC = toCents(args.spentSoFar);
  const priceC = toCents(args.price);
  const revenueC = toCents(args.revenue);

  const lossFromPayingC = spentC + priceC - revenueC;
  const lossFromRefundingC = spentC + revenueC;

  const decision = lossFromPayingC < lossFromRefundingC ? "PAY_ANYWAY" : "REFUND";
  const lossFromPaying = toDollars(lossFromPayingC);
  const lossFromRefunding = toDollars(lossFromRefundingC);

  const rationale =
    decision === "PAY_ANYWAY"
      ? `Only viable path left costs more than the ${formatUsd(toDollars(revenueC - spentC))} remaining. ` +
        `Paying anyway costs ${formatUsd(lossFromPaying)}${lossFromPaying < 0 ? " (still profitable)" : ""}; ` +
        `refunding would cost ${formatUsd(lossFromRefunding)} (the ${formatUsd(toDollars(spentC))} already spent, plus the refund). ` +
        `Delivering at a loss beats refunding.`
      : `Paying anyway would cost ${formatUsd(lossFromPaying)}, which is not less than the ${formatUsd(lossFromRefunding)} ` +
        `it costs to refund (the ${formatUsd(toDollars(spentC))} already spent, plus the refund), so Margin402 refunds instead.`;

  return { lossFromPaying, lossFromRefunding, decision, rationale };
}
