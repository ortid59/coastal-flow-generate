import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Calendar, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  campaign_date: string | null;
  markets: string[] | null;
  flight_start: string | null;
  flight_end: string | null;
  status: string | null;
  created_at: string;
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
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, client_name, campaign_name, campaign_date, markets, flight_start, flight_end, status, created_at")
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Couldn't load campaigns", description: error.message, variant: "destructive" });
      } else {
        setCampaigns(data ?? []);
      }
      setLoading(false);
    })();
  }, [toast]);

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
            <Link
              key={c.id}
              to={`/campaigns/${c.id}/review`}
              className="surface-card group block p-6 transition-all hover:shadow-elev-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {c.client_name}
                  </div>
                  <h3 className="mt-1 truncate font-heading text-lg group-hover:text-primary">
                    {c.campaign_name}
                  </h3>
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
              </div>
            </Link>
          ))}
        </div>
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
