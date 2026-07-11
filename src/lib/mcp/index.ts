import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCompanies from "./tools/list-companies";
import getCompanyConfig from "./tools/get-company-config";
import listReferrals from "./tools/list-referrals";

// Build the OAuth issuer from the Supabase project ref (Vite inlines this at
// build time, so the module stays import-safe — no runtime env read at top
// level). The fallback keeps the issuer well-formed during the manifest
// extract; real tokens verify against the true issuer at runtime.
const projectRef =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "intrinsic-mcp",
  title: "Intrinsic",
  version: "0.1.0",
  instructions:
    "Read-only access to Intrinsic's HCBS financial modeling data. Use `list_companies` to discover the companies you can see, `get_company_config` to read a company's full v2 config JSON, and `list_referrals` to browse a company's referral pipeline. All access is scoped by the signed-in user's licensee assignments (RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCompanies, getCompanyConfig, listReferrals],
});
