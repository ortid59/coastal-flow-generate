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
  name: "campaign_summary",
  title: "Summarize a campaign",
  description:
    "Return aggregate metrics for a campaign: included unit count, market breakdown, vendor breakdown, total four-week impressions, and total campaign cost (with the campaign margin already applied).",
  inputSchema: {
    campaign_id: z.string().uuid().describe("Campaign UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaign_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data: campaign, error: cErr } = await sb
      .from("campaigns")
      .select("id, campaign_name, client_name, margin_pct, markets")
      .eq("id", campaign_id)
      .maybeSingle();
    if (cErr) return { content: [{ type: "text", text: cErr.message }], isError: true };
    if (!campaign)
      return { content: [{ type: "text", text: "Campaign not found" }], isError: true };

    const { data: units, error: uErr } = await sb
      .from("units")
      .select(
        "market, vendor, four_week_impressions, negotiated_rate_4wk, four_week_periods, included",
      )
      .eq("campaign_id", campaign_id);
    if (uErr) return { content: [{ type: "text", text: uErr.message }], isError: true };

    const margin = 1 + (Number(campaign.margin_pct ?? 0) || 0) / 100;
    const included = (units ?? []).filter((u) => u.included !== false);

    const byMarket: Record<string, number> = {};
    const byVendor: Record<string, number> = {};
    let totalImpressions = 0;
    let totalCost = 0;
    for (const u of included) {
      byMarket[u.market ?? "Unknown"] = (byMarket[u.market ?? "Unknown"] ?? 0) + 1;
      byVendor[u.vendor ?? "Unknown"] = (byVendor[u.vendor ?? "Unknown"] ?? 0) + 1;
      totalImpressions += Number(u.four_week_impressions ?? 0) || 0;
      const rate = Number(u.negotiated_rate_4wk ?? 0) || 0;
      const periods = Number(u.four_week_periods ?? 1) || 1;
      totalCost += rate * margin * periods;
    }

    const summary = {
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      client_name: campaign.client_name,
      margin_pct: campaign.margin_pct,
      included_unit_count: included.length,
      total_unit_count: (units ?? []).length,
      by_market: byMarket,
      by_vendor: byVendor,
      total_four_week_impressions: totalImpressions,
      total_campaign_cost: Math.round(totalCost * 100) / 100,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: { summary },
    };
  },
});
