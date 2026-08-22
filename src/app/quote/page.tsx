import { QuoteScreen } from "@/components/quote/QuoteScreen";
import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { buildPlans, toCustomerPlan } from "@/lib/economics/plans";

export const metadata = { title: "Quote" };

/**
 * Only the public price crosses to the client — passing LOCKED_QUOTE whole
 * would serialize floor/expectedCost/riskReserve into the RSC payload,
 * where any customer could read them out of page source. Plans go through
 * the same sanitizing boundary (toCustomerPlan) for the same reason.
 */
export default function QuotePage() {
  return <QuoteScreen quotePrice={LOCKED_QUOTE.quote} plans={buildPlans().map(toCustomerPlan)} />;
}
