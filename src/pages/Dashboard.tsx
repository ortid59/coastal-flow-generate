import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, Calendar, Loader2, MapPin, MoreHorizontal, Pencil, Trash2, Share2 } from "lucide-react";
import { format } from "date-fns";
import { EditCampaignDialog } from "@/components/EditCampaignDialog";
import { SharePortalDialog } from "@/components/SharePortalDialog";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  proposal_name: string | null;
  campaign_date: string | null;
  markets: string[] | null;
  flight_start: string | null;
  flight_end: string | null;
  margin_pct: number | null;
  status: string | null;
  created_at: string;
  portal_token: string | null;
  portal_password_hash: string | null;
  client_logo_url: string | null;
  cover_image_url: string | null;
  canva_design_url: string | null;
};

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  parsing: "bg-warning/15 text-warning-foreground border border-warning/40",
  ready: "bg-secondary text-secondary-foreground",
  published: "bg-success/15 text-success border border-success/30",
  error: "bg-destructive/10 text-destructive border border-destructive/30",
};

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [shareTarget, setShareTarget] = useState<Campaign | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const { data, error } = await supabase
      .from("campaigns")
      .select(
        "id, client_name, campaign_name, proposal_name, campaign_date, markets, flight_start, flight_end, margin_pct, status, created_at, portal_token, portal_password_hash, client_logo_url, cover_image_url, canva_design_url",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load campaigns", description: error.message, variant: "destructive" });
    } else {
      setCampaigns((data ?? []) as Campaign[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (c: Campaign) => {
    if (!confirm(`Delete "${c.campaign_name}"? This removes all units, files and the share link permanently.`)) return;
    // Manually cascade: units, vendor_files, jobs, then campaign
    const [u, vf, j] = await Promise.all([
      supabase.from("units").delete().eq("campaign_id", c.id),
      supabase.from("vendor_files").delete().eq("campaign_id", c.id),
      supabase.from("jobs").delete().eq("campaign_id", c.id),
    ]);
    const childErr = u.error ?? vf.error ?? j.error;
    if (childErr) {
      toast({ title: "Couldn't delete", description: childErr.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("campaigns").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
    toast({ title: "Campaign deleted" });
  };

  return (
    <main className="container-app py-10 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading">Campaigns</h1>
          <p className="mt-2 text-muted-foreground">Upload vendor files and generate client-ready proposals.</p>
        </div>
        <Button asChild size="lg" className="bg-gradient-hero shadow-elev-md hover:opacity-95">
          <Link to="/campaigns/new">
            <Plus className="h-4 w-4" /> New Campaign
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="surface-card group relative block p-6 transition-all hover:shadow-elev-md hover:-translate-y-0.5"
            >
              {/* Action menu */}
              <div className="absolute top-3 right-3 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditTarget(c)}>
                      <Pencil className="h-4 w-4" /> Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShareTarget(c)}>
                      <Share2 className="h-4 w-4" /> Share with client
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => remove(c)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Link to={`/campaigns/${c.id}/review`} className="block pr-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {c.client_name}
                    </div>
                    <h3 className="mt-1 truncate font-heading text-lg group-hover:text-primary">
                      {c.campaign_name}
                    </h3>
                    {c.proposal_name && (
                      <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                        {c.proposal_name}
                      </p>
                    )}
                  </div>
                  <Badge className={statusStyle[c.status ?? "draft"] ?? statusStyle.draft}>
                    {c.status ?? "draft"}
                  </Badge>
                </div>

                <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                  {c.markets && c.markets.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{c.markets.join(", ")}</span>
                    </div>
                  )}
                  {(c.flight_start || c.flight_end) && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {c.flight_start ? format(new Date(c.flight_start), "MMM d, yyyy") : "—"}
                        {" → "}
                        {c.flight_end ? format(new Date(c.flight_end), "MMM d, yyyy") : "—"}
                      </span>
                    </div>
                  )}
                  {c.portal_password_hash && (
                    <div className="flex items-center gap-2 text-success">
                      <Share2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Shared with client</span>
                    </div>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <EditCampaignDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          campaignId={editTarget.id}
          initial={{
            client_name: editTarget.client_name,
            campaign_name: editTarget.campaign_name,
            proposal_name: editTarget.proposal_name,
            markets: editTarget.markets,
            flight_start: editTarget.flight_start,
            flight_end: editTarget.flight_end,
            margin_pct: editTarget.margin_pct,
            client_logo_url: editTarget.client_logo_url,
            cover_image_url: editTarget.cover_image_url,
            canva_design_url: editTarget.canva_design_url,
            status: editTarget.status,
            campaign_date: editTarget.campaign_date,
          }}
          onSaved={load}
        />
      )}
      {shareTarget && (
        <SharePortalDialog
          open={!!shareTarget}
          onOpenChange={(o) => !o && setShareTarget(null)}
          campaignId={shareTarget.id}
          campaignName={shareTarget.campaign_name}
        />
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <FileText className="h-7 w-7" />
      </div>
      <div>
        <h3 className="font-heading">No campaigns yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Start by uploading a vendor Excel and photo PDF to build your first proposal.
        </p>
      </div>
      <Button asChild>
        <Link to="/campaigns/new">
          <Plus className="h-4 w-4" /> New Campaign
        </Link>
      </Button>
    </div>
  );
}
