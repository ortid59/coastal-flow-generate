import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCampaigns from "./tools/list-campaigns";
import getCampaign from "./tools/get-campaign";
import listUnits from "./tools/list-units";
import campaignSummary from "./tools/campaign-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "coastal-maverick-mcp",
  title: "Coastal Maverick Proposal Generator",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's billboard proposal campaigns. Use list_campaigns to discover campaigns, get_campaign for full details, list_units for the media units in a campaign, and campaign_summary for aggregate metrics (unit counts, impressions, total cost with margin applied).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCampaigns, getCampaign, listUnits, campaignSummary],
});
