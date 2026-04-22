import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
  ImageOff,
  AlertCircle,
  Share2,
  FileText,
  Eye,
} from "lucide-react";
import { UnitPhotoUpload } from "@/components/UnitPhotoUpload";
import { UnitMapUpload } from "@/components/UnitMapUpload";
import { SharePortalDialog } from "@/components/SharePortalDialog";
import { ReuploadFilesDialog } from "@/components/ReuploadFilesDialog";

import { HighlightsCell } from "@/components/HighlightsCell";
import { LogoReplace } from "@/components/LogoReplace";
import { parseShortAddress } from "@/lib/shortAddress";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  proposal_name: string | null;
  client_logo_url: string | null;
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
  highlights: string | null;
  four_week_impressions: number | null;
  total_cost: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
  inset_map_url: string | null;
  low_res_flag: boolean | null;
  latitude: number | null;
  longitude: number | null;
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
  const [extractingHl, setExtractingHl] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const [c, u] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, client_name, campaign_name, proposal_name, client_logo_url, status, markets")
        .eq("id", id)
        .single(),
      supabase
        .from("units")
        .select(
          "id, unit_number, market, vendor, format, size, location_description, insight_bullets, highlights, four_week_impressions, total_cost, cpm, recommended, included, billboard_photo_url, inset_map_url, low_res_flag, latitude, longitude",
        )
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

  const extractHighlights = async () => {
    if (!id) return;
    setExtractingHl(true);
    const { data, error } = await supabase.functions.invoke("extract-highlights", { body: { campaign_id: id } });
    setExtractingHl(false);
    if (error) {
      toast({ title: "Highlights extraction failed", description: error.message, variant: "destructive" });
    } else {
      const s = (data as any)?.summary;
      toast({
        title: "Highlights extracted",
        description: s ? `${s.units_with_highlights} units · ${s.pages_processed} pages` : "Done",
      });
      load();
    }
  };

  const toggleField = async (unit: Unit, field: "recommended" | "included", value: boolean) => {
    // optimistic update
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: value } : u)));
    const patch = field === "recommended" ? { recommended: value } : { included: value };
    const { error } = await supabase.from("units").update(patch).eq("id", unit.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      // revert
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: !value } : u)));
    }
  };

  const stats = useMemo(() => {
    const included = units.filter((u) => u.included !== false);
    const recs = included.filter((u) => u.recommended).length;
    const imps = included.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = included.reduce((s, u) => s + (u.total_cost ?? 0), 0);
    const photos = included.filter((u) => u.billboard_photo_url).length;
    return { total: units.length, included: included.length, recs, imps, cost, photos };
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

      <header className="mb-8 surface-card p-6 flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-5 min-w-0 flex-1">
          {id && campaign && (
            <LogoReplace
              campaignId={id}
              currentUrl={campaign.client_logo_url}
              clientName={campaign.client_name}
              onUploaded={(url) => setCampaign({ ...campaign, client_logo_url: url })}
            />
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {campaign?.client_name}
            </div>
            <h1 className="font-heading mt-1 text-2xl">{campaign?.campaign_name}</h1>
            {campaign?.proposal_name && (
              <p className="mt-1 text-sm italic text-[hsl(var(--ocean))]">{campaign.proposal_name}</p>
            )}
            {campaign?.markets?.length ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {campaign.markets.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={campaign?.status ?? "draft"} />
          <Button variant="outline" size="sm" onClick={extractPhotos} disabled={extracting || units.length === 0}>
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            Extract photos
          </Button>
          <Button variant="outline" size="sm" onClick={extractHighlights} disabled={extractingHl || units.length === 0}>
            {extractingHl ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Extract highlights
          </Button>
          <Button variant="outline" size="sm" onClick={reparse} disabled={reparsing || campaign?.status === "parsing"}>
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-parse
          </Button>
          <Button variant="outline" size="sm" asChild disabled={units.length === 0}>
            <Link to={`/campaigns/${id}/preview`}>
              <Eye className="h-4 w-4" /> Preview presentation
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={() => setShareOpen(true)}
            disabled={units.length === 0}
            className="bg-gradient-hero hover:opacity-95"
          >
            <Share2 className="h-4 w-4" /> Share with client
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
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Units in proposal" value={`${stats.included} / ${stats.total}`} />
            <Stat label="Recommended" value={String(stats.recs)} />
            <Stat label="Photos matched" value={`${stats.photos} / ${stats.included}`} />
            <Stat label="4-Week Impressions" value={fmtNum(stats.imps)} />
            <Stat label="Total Cost" value={fmtMoney(stats.cost)} />
          </section>

          <p className="mb-3 text-xs text-muted-foreground">
            Toggle <span className="font-medium text-foreground">Include</span> to add/remove a unit from the proposal.
            Toggle <span className="font-medium text-foreground">Recommend</span> to feature it as a hero card on the
            client page.
          </p>

          <div className="items-start">
            <div className="surface-card overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Photo</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-left">Market</th>
                      <th className="px-4 py-3 text-left">Format</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-right">4wk Imp</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">CPM</th>
                      <th className="px-4 py-3 text-center">Include</th>
                      <th className="px-4 py-3 text-center">Recommend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {units.map((u) => {
                      const excluded = u.included === false;
                      const isHighlighted = u.id === highlightedId;
                      return (
                        <tr
                          key={u.id}
                          onClick={() => setHighlightedId(u.id)}
                          className={`cursor-pointer transition-colors ${u.recommended && !excluded ? "bg-success/5" : ""} ${excluded ? "opacity-50" : ""} ${isHighlighted ? "ring-2 ring-inset ring-[hsl(var(--accent-gold))] bg-[hsl(var(--accent-gold)/0.06)]" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                              {u.billboard_photo_url ? (
                                <div className="relative h-14 w-20 overflow-hidden rounded-md bg-muted">
                                  <img
                                    src={u.billboard_photo_url}
                                    alt={`Unit ${u.unit_number}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                  {u.low_res_flag && (
                                    <span
                                      title="Low-resolution photo"
                                      className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-warning/90 text-warning-foreground"
                                    >
                                      <AlertCircle className="h-3 w-3" />
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex h-14 w-20 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                  <ImageOff className="h-4 w-4" />
                                </div>
                              )}
                              {id && (
                                <UnitPhotoUpload
                                  campaignId={id}
                                  unitId={u.id}
                                  unitNumber={u.unit_number}
                                  onUploaded={load}
                                />
                              )}
                              {id && (
                                <UnitMapUpload
                                  campaignId={id}
                                  unitId={u.id}
                                  unitNumber={u.unit_number}
                                  onUploaded={load}
                                />
                              )}
                              {u.inset_map_url && (
                                <div className="h-10 w-20 overflow-hidden rounded border border-border">
                                  <img src={u.inset_map_url} alt="Map" className="h-full w-full object-cover" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top font-medium">
                            <div className="flex items-center gap-2">
                              {u.unit_number}
                              {u.recommended && (
                                <Badge className="bg-success/15 text-success border border-success/30 gap-1">
                                  <Sparkles className="h-3 w-3" /> Rec
                                </Badge>
                              )}
                              {u.latitude != null && u.longitude != null && (
                                <MapPin className="h-3 w-3 text-[hsl(var(--accent-gold))]" />
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
                            <div className="font-medium text-foreground">
                              {parseShortAddress(u.location_description) || "—"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                              {u.location_description ?? ""}
                            </div>
                            <div className="mt-2">
                              <HighlightsEditor
                                unitId={u.id}
                                initial={u.highlights}
                                onSaved={(next) =>
                                  setUnits((prev) =>
                                    prev.map((x) => (x.id === u.id ? { ...x, highlights: next } : x)),
                                  )
                                }
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-right tabular-nums">{fmtNum(u.four_week_impressions)}</td>
                          <td className="px-4 py-3 align-top text-right tabular-nums">{fmtMoney(u.total_cost)}</td>
                          <td className="px-4 py-3 align-top text-right tabular-nums">{u.cpm == null ? "—" : `$${u.cpm.toFixed(2)}`}</td>
                          <td className="px-4 py-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={u.included !== false}
                              onCheckedChange={(v) => toggleField(u, "included", v)}
                            />
                          </td>
                          <td className="px-4 py-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={!!u.recommended}
                              onCheckedChange={(v) => toggleField(u, "recommended", v)}
                              disabled={excluded}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}

      {campaign && (
        <SharePortalDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          campaignId={campaign.id}
          campaignName={campaign.campaign_name}
        />
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
