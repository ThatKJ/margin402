import { QuoteScreen } from "@/components/quote/QuoteScreen";
import { LOCKED_QUOTE } from "@/lib/economics/quote";

export const metadata = { title: "Quote" };

export default function QuotePage() {
  return <QuoteScreen quote={LOCKED_QUOTE} />;
}
