import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, MapPin, Sparkles, AlertTriangle, RefreshCw, Image as ImageIcon, ImageOff, AlertCircle } from "lucide-react";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  status: string | null;
  markets: string[] | null;
};

type Unit = {
  id: string;
  unit_number: string;
  market: string | null;
  vendor: string | null;
  format: string | null;
  size: string | null;
  location_description: string | null;
  insight_bullets: string[] | null;
  four_week_impressions: number | null;
  total_cost: number | null;
  cpm: number | null;
  recommended: boolean | null;
  billboard_photo_url: string | null;
  low_res_flag: boolean | null;
};

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function CampaignReview() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [reparsing, setReparsing] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const load = async () => {
    if (!id) return;
    const [c, u] = await Promise.all([
      supabase.from("campaigns").select("id, client_name, campaign_name, status, markets").eq("id", id).single(),
      supabase
        .from("units")
        .select("id, unit_number, market, vendor, format, size, location_description, insight_bullets, four_week_impressions, total_cost, cpm, recommended, billboard_photo_url, low_res_flag")
        .eq("campaign_id", id)
        .order("recommended", { ascending: false })
        .order("market", { ascending: true })
        .order("unit_number", { ascending: true }),
    ]);
    if (c.error) toast({ title: "Couldn't load campaign", description: c.error.message, variant: "destructive" });
    else setCampaign(c.data as Campaign);
    if (u.error) toast({ title: "Couldn't load units", description: u.error.message, variant: "destructive" });
    else setUnits((u.data ?? []) as Unit[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll while parsing
  useEffect(() => {
    if (!campaign) return;
    if (campaign.status !== "parsing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status]);

  const reparse = async () => {
    if (!id) return;
    setReparsing(true);
    const { error } = await supabase.functions.invoke("parse-excel", { body: { campaign_id: id } });
    setReparsing(false);
    if (error) toast({ title: "Parse failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Parsing started" });
      load();
    }
  };

  const extractPhotos = async () => {
    if (!id) return;
    setExtracting(true);
    const { data, error } = await supabase.functions.invoke("extract-photos", { body: { campaign_id: id } });
    setExtracting(false);
    if (error) {
      toast({ title: "Photo extraction failed", description: error.message, variant: "destructive" });
    } else {
      const s = (data as any)?.summary;
      toast({
        title: "Photos extracted",
        description: s ? `${s.units_with_photo} units matched · ${s.low_res_count} low-res` : "Done",
      });
      load();
    }
  };

  const stats = useMemo(() => {
    const recs = units.filter((u) => u.recommended).length;
    const imps = units.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = units.reduce((s, u) => s + (u.total_cost ?? 0), 0);
    const photos = units.filter((u) => u.billboard_photo_url).length;
    return { total: units.length, recs, imps, cost, photos };
  }, [units]);

  if (loading) {
    return (
      <main className="container-app py-14 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="container-app py-10 md:py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {campaign?.client_name}
          </div>
          <h1 className="font-heading mt-1">{campaign?.campaign_name}</h1>
          {campaign?.markets?.length ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {campaign.markets.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={campaign?.status ?? "draft"} />
          <Button variant="outline" size="sm" onClick={reparse} disabled={reparsing || campaign?.status === "parsing"}>
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-parse
          </Button>
        </div>
      </header>

      {campaign?.status === "parsing" && units.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <h3 className="font-heading">Parsing vendor Excel…</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Mapping headers, detecting recommended rows, splitting location bullets.
          </p>
        </div>
      ) : campaign?.status === "error" ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <h3 className="font-heading">Parsing failed</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Something went wrong reading the vendor Excel. Try Re-parse, or check the file format.
          </p>
        </div>
      ) : units.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No units parsed yet.</p>
        </div>
      ) : (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-4">
            <Stat label="Units" value={String(stats.total)} />
            <Stat label="Recommended" value={String(stats.recs)} />
            <Stat label="4-Week Impressions" value={fmtNum(stats.imps)} />
            <Stat label="Total Cost" value={fmtMoney(stats.cost)} />
          </section>

          <div className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Unit</th>
                    <th className="px-4 py-3 text-left">Market</th>
                    <th className="px-4 py-3 text-left">Format</th>
                    <th className="px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-right">4wk Imp</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">CPM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {units.map((u) => (
                    <tr key={u.id} className={u.recommended ? "bg-success/5" : ""}>
                      <td className="px-4 py-3 align-top font-medium">
                        <div className="flex items-center gap-2">
                          {u.unit_number}
                          {u.recommended && (
                            <Badge className="bg-success/15 text-success border border-success/30 gap-1">
                              <Sparkles className="h-3 w-3" /> Rec
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.vendor}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">{u.market ?? "—"}</td>
                      <td className="px-4 py-3 align-top">
                        <div>{u.format ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.size ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 align-top max-w-md">
                        {u.insight_bullets && u.insight_bullets.length > 1 ? (
                          <ul className="list-disc pl-4 space-y-0.5">
                            {u.insight_bullets.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>{u.location_description ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums">{fmtNum(u.four_week_impressions)}</td>
                      <td className="px-4 py-3 align-top text-right tabular-nums">{fmtMoney(u.total_cost)}</td>
                      <td className="px-4 py-3 align-top text-right tabular-nums">{u.cpm == null ? "—" : `$${u.cpm.toFixed(2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-2xl">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    parsing: "bg-warning/15 text-warning-foreground border border-warning/40",
    ready: "bg-success/15 text-success border border-success/30",
    published: "bg-primary/15 text-primary border border-primary/30",
    error: "bg-destructive/10 text-destructive border border-destructive/30",
  };
  return <Badge className={styles[status] ?? styles.draft}>{status}</Badge>;
}
