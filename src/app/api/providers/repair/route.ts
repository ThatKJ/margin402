import { createProviderRoute } from "@/lib/providers/create-provider-route";

// POST, not GET: repair takes the previous attempt's failing tests as a JSON body.
export const POST = createProviderRoute("s2");
