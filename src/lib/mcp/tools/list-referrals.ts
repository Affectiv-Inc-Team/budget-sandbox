import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_referrals",
  title: "List referrals",
  description:
    "List referrals for a company. Does NOT include SSN. Access is enforced by RLS on the referrals table.",
  inputSchema: {
    company_id: z.string().min(1).describe("Company id to scope the referrals to."),
    stage: z
      .string()
      .optional()
      .describe("Optional pipeline stage filter (e.g. 'inquiry', 'accepted', 'enrolled')."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max rows to return. Defaults to 50, capped at 200."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, stage, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const cap = Math.min(Math.max(limit ?? 50, 1), 200);
    let q = sb(ctx)
      .from("referrals")
      .select(
        "id, company_id, first_name, last_name, preferred_name, stage, outcome, service_level, pay_source, city, county, region, state, is_minor, stage_entered_at, last_activity_at, created_at",
      )
      .eq("company_id", company_id)
      .order("last_activity_at", { ascending: false })
      .limit(cap);
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [
        { type: "text", text: `Found ${data?.length ?? 0} referrals.` },
        { type: "text", text: JSON.stringify(data ?? [], null, 2) },
      ],
      structuredContent: { referrals: data ?? [] },
    };
  },
});
