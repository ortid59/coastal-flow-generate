import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_units",
  title: "List units for a campaign",
  description:
    "List billboard/media units for a campaign belonging to the signed-in user. Includes unit number, market, vendor, size, four-week rate and impressions, and highlights.",
  inputSchema: {
    campaign_id: z.string().uuid().describe("Campaign UUID."),
    included_only: z
      .boolean()
      .optional()
      .describe("If true, return only units marked included in the proposal."),
    limit: z.number().int().min(1).max(500).optional().describe("Max units. Default 200."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaign_id, included_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("units")
      .select(
        "id, unit_number, market, city, vendor, size, format, media_type, location_description, four_week_impressions, negotiated_rate_4wk, four_week_periods, total_cost, highlights, tier_a, tier_b, tier_c, included, recommended",
      )
      .eq("campaign_id", campaign_id)
      .order("row_index", { ascending: true, nullsFirst: false })
      .limit(limit ?? 200);
    if (included_only) q = q.eq("included", true);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { units: data ?? [] },
    };
  },
});
