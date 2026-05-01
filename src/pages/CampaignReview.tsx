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
  Upload,
} from "lucide-react";
import { UnitPhotoUpload } from "@/components/UnitPhotoUpload";
import { UnitMapUpload } from "@/components/UnitMapUpload";
import { SharePortalDialog } from "@/components/SharePortalDialog";
import { ReuploadFilesDialog } from "@/components/ReuploadFilesDialog";
import { CampaignFilesHistory } from "@/components/CampaignFilesHistory";

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
  show_tier_a: boolean | null;
  show_tier_b: boolean | null;
  show_tier_c: boolean | null;
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
  tier_a: boolean | null;
  tier_b: boolean | null;
  tier_c: boolean | null;
};

type TierKey = "tier_a" | "tier_b" | "tier_c";
type ShowTierKey = "show_tier_a" | "show_tier_b" | "show_tier_c";
const TIERS: { key: TierKey; show: ShowTierKey; label: string; short: string }[] = [
  { key: "tier_a", show: "show_tier_a", label: "Option A", short: "A" },
  { key: "tier_b", show: "show_tier_b", label: "Option B", short: "B" },
  { key: "tier_c", show: "show_tier_c", label: "Option C", short: "C" },
];

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
        .select("id, client_name, campaign_name, proposal_name, client_logo_url, status, markets, show_tier_a, show_tier_b, show_tier_c")
        .eq("id", id)
        .single(),
      supabase
        .from("units")
        .select(
          "id, unit_number, market, vendor, format, size, location_description, insight_bullets, highlights, four_week_impressions, total_cost, cpm, recommended, included, billboard_photo_url, inset_map_url, low_res_flag, latitude, longitude, tier_a, tier_b, tier_c",
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

  // Auto-run photo extraction once parsing finishes (covers initial campaign
  // creation flow, where NewCampaign navigates here while status === "parsing").
  const [autoExtracted, setAutoExtracted] = useState(false);
  useEffect(() => {
    if (!campaign || autoExtracted) return;
    if (campaign.status === "parsing") return;
    if (units.length === 0) return;
    const needsPhotos = units.some((u) => !u.billboard_photo_url || !u.inset_map_url);
    if (!needsPhotos) return;
    setAutoExtracted(true);
    extractPhotos({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, units.length, autoExtracted]);


  const reparse = async () => {
    if (!id) return;
    setReparsing(true);
    const { error } = await supabase.functions.invoke("parse-excel", { body: { campaign_id: id } });
    setReparsing(false);
    if (error) toast({ title: "Parse failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Parsing started" });
      await load();
      // Auto-run photo extraction after re-parse (silent if no PDF exists)
      extractPhotos({ silent: true });
    }
  };

  const extractPhotos = async (opts?: { silent?: boolean }) => {
    if (!id) return;
    const silent = !!opts?.silent;
    if (!silent) setExtracting(true);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

      const { data: units, error: uErr } = await supabase
        .from('units')
        .select('id, unit_number, billboard_photo_url, inset_map_url')
        .eq('campaign_id', id);
      if (uErr) throw uErr;
      if (!units || units.length === 0) throw new Error('No units found. Parse the Excel file first.');

      const unitByNumber = new Map<string, (typeof units)[number]>();
      for (const u of units) {
        const raw = String(u.unit_number).trim();
        unitByNumber.set(raw, u);
        unitByNumber.set(raw.padStart(6, '0'), u);
        unitByNumber.set(String(parseInt(raw, 10)), u);
      }

      const { data: vendorFiles, error: fErr } = await supabase
        .from('vendor_files')
        .select('id, storage_path, original_name')
        .eq('campaign_id', id);
      if (fErr) throw fErr;

      const pdfFiles = (vendorFiles ?? []).filter((f) =>
        f.original_name?.toLowerCase().endsWith('.pdf')
      );
      if (!pdfFiles.length) {
        if (silent) return;
        throw new Error('No PDF file found for this campaign. Upload the Photo Sheets PDF first.');
      }

      let totalPhotos = 0;
      let totalMaps = 0;

       // Static crop coordinates measured from Clear Channel PDF layout
       const billboardCrop = { x: 0.042, y: 0.329, w: 0.506, h: 0.441 };
       const mapCrop       = { x: 0.579, y: 0.180, w: 0.379, h: 0.340 };

      for (const file of pdfFiles) {
        const { data: blob, error: dlErr } = await supabase.storage
          .from('uploads')
          .download(file.storage_path);
        if (dlErr || !blob) {
          console.warn('PDF download failed:', dlErr?.message);
          continue;
        }

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer, disableFontFace: true }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          const match = text.match(/(\b\d{6})\s*[–\-]\s*[A-Za-z]/);

          if (pageNum === 1 || !match) {
            page.cleanup();
            continue;
          }

          const unitNumber = match[1];
          const unit = unitByNumber.get(unitNumber)
            ?? unitByNumber.get(unitNumber.padStart(6, '0'))
            ?? unitByNumber.get(String(parseInt(unitNumber, 10)));
          if (!unit) {
            console.warn(`Unit ${unitNumber} not found in campaign, skipping`);
            page.cleanup();
            continue;
          }

          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          const W = canvas.width;
          const H = canvas.height;

          const uploadCrop = async (
            crop: { x: number; y: number; w: number; h: number },
            storageBucket: string,
            storagePath: string,
            dbField: string,
          ): Promise<boolean> => {
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = Math.round(W * crop.w);
            cropCanvas.height = Math.round(H * crop.h);
            const cropCtx = cropCanvas.getContext('2d')!;
            cropCtx.drawImage(
              canvas,
              Math.round(W * crop.x),
              Math.round(H * crop.y),
              Math.round(W * crop.w),
              Math.round(H * crop.h),
              0, 0,
              cropCanvas.width,
              cropCanvas.height,
            );
            const imageBlob = await new Promise<Blob>((resolve) =>
              cropCanvas.toBlob((b) => resolve(b!), 'image/png'),
            );
            const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
            const { error: upErr } = await supabase.storage
              .from(storageBucket)
              .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true });
            if (upErr) {
              console.warn(`Upload failed for ${unitNumber} (${dbField}):`, upErr.message);
              return false;
            }

            let url: string;
            if (storageBucket === 'photos') {
              const { data: signed, error: signErr } = await supabase.storage
                .from('photos')
                .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
              if (signErr || !signed) {
                console.warn(`Sign URL failed for ${storagePath}:`, signErr?.message);
                return false;
              }
              url = signed.signedUrl;
            } else {
              const { data: pubData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
              url = `${pubData.publicUrl}?v=${Date.now()}`;
            }

            const { error: updateErr } = await supabase
              .from('units')
              .update({ [dbField]: url } as any)
              .eq('id', unit.id);
            if (updateErr) {
              console.warn(`DB update failed for ${unitNumber} (${dbField}):`, updateErr.message);
              return false;
            } else {
              (unit as any)[dbField] = url;
              return true;
            }
          };

          // Use static crop coordinates defined above

          if (!unit.billboard_photo_url) {
            const ok = await uploadCrop(
              billboardCrop,
              'photos',
              `${id}/${unit.id}.png`,
              'billboard_photo_url',
            );
            if (ok) totalPhotos++;
          }
          const okMap = await uploadCrop(
            mapCrop,
            'minimaps',
            `${id}/${unit.id}-map.png`,
            'inset_map_url',
          );
          if (okMap) totalMaps++;

          page.cleanup();
        }
      }

      if (!silent || totalPhotos > 0 || totalMaps > 0) {
        toast({
          title: 'Photos extracted',
          description: `${totalPhotos} billboard photos · ${totalMaps} maps matched`,
        });
      }
      load();
    } catch (err: any) {
      console.error('[extractPhotos]', err);
      if (!silent) {
        toast({
          title: 'Photo extraction failed',
          description: err.message ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setExtracting(false);
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

  const toggleField = async (
    unit: Unit,
    field: "recommended" | "included" | TierKey,
    value: boolean,
  ) => {
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: value } : u)));
    const patch: Record<string, boolean> = { [field]: value };
    const { error } = await supabase.from("units").update(patch as any).eq("id", unit.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, [field]: !value } : u)));
    }
  };

  const toggleCampaignTier = async (field: ShowTierKey, value: boolean) => {
    if (!campaign) return;
    setCampaign({ ...campaign, [field]: value });
    const patch: Record<string, boolean> = { [field]: value };
    const { error } = await supabase.from("campaigns").update(patch as any).eq("id", campaign.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      setCampaign({ ...campaign, [field]: !value });
    }
  };

  const stats = useMemo(() => {
    const included = units.filter((u) => u.included !== false);
    const recs = included.filter((u) => u.recommended).length;
    const imps = included.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = included.reduce((s, u) => s + (u.total_cost ?? 0), 0);
    const photos = included.filter((u) => u.billboard_photo_url).length;
    const tierTotals: Record<TierKey, number> = { tier_a: 0, tier_b: 0, tier_c: 0 };
    const tierCounts: Record<TierKey, number> = { tier_a: 0, tier_b: 0, tier_c: 0 };
    for (const u of included) {
      for (const t of TIERS) {
        if (u[t.key]) {
          tierTotals[t.key] += u.total_cost ?? 0;
          tierCounts[t.key] += 1;
        }
      }
    }
    return { total: units.length, included: included.length, recs, imps, cost, photos, tierTotals, tierCounts };
  }, [units]);


  if (loading) {
    return (
      <main className="container-app py-14 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="w-full max-w-none px-4 md:px-6 py-10 md:py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <header className="surface-card mb-6 p-6">
        {/* Top row: logo + identity */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5 min-w-0 flex-1">
            {id && campaign && (
              <LogoReplace
                campaignId={id}
                currentUrl={campaign.client_logo_url}
                clientName={campaign.client_name}
                onUploaded={(url) => setCampaign({ ...campaign, client_logo_url: url })}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {campaign?.client_name}
              </div>
              <h1 className="font-heading mt-1 text-xl md:text-2xl leading-tight break-words normal-case tracking-normal">
                {campaign?.campaign_name}
              </h1>
              {campaign?.proposal_name && (
                <p className="mt-1 text-sm italic text-[hsl(var(--ocean))] break-words">
                  {campaign.proposal_name}
                </p>
              )}
              {campaign?.markets?.length ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {campaign.markets.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
          <StatusBadge status={campaign?.status ?? "draft"} />
        </div>

        {/* Toolbar — its own row so the title never collapses to a thin column */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => extractPhotos()} disabled={extracting || units.length === 0}>
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
          <Button variant="outline" size="sm" onClick={() => setReuploadOpen(true)}>
            <Upload className="h-4 w-4" /> Re-upload files
          </Button>
          <Button variant="outline" size="sm" asChild disabled={units.length === 0}>
            <Link to={`/campaigns/${id}/preview`}>
              <Eye className="h-4 w-4" /> Preview presentation
            </Link>
          </Button>
          <div className="ml-auto" />
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
            client page. Use <span className="font-medium text-foreground">A / B / C</span> to assign a unit to one or
            more pricing tiers shown in the proposal.
          </p>

          {/* Campaign-level tier master switches with running totals (Change 3C) */}
          {campaign && (
            <section className="surface-card mb-6 p-5">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Show in presentation
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {TIERS.map((t) => (
                  <label
                    key={t.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Switch
                        checked={!!campaign[t.show]}
                        onCheckedChange={(v) => toggleCampaignTier(t.show, v)}
                      />
                      <span className="text-sm font-medium">Include {t.label}</span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {stats.tierCounts[t.key]} unit{stats.tierCounts[t.key] === 1 ? "" : "s"} ·{" "}
                      <span className="font-semibold text-foreground">{fmtMoney(stats.tierTotals[t.key])}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <div className="items-start">
            <div className="overflow-x-auto -mx-4 md:-mx-6">
              <div className="min-w-[1200px] px-4 md:px-6">
                <div className="surface-card overflow-hidden min-w-0">
                  <div className="w-full">
                    <table className="w-full table-fixed text-[12px]">
                      <colgroup>
                        <col className="w-[120px]" />
                        <col className="w-[110px]" />
                        <col className="w-[90px]" />
                        <col className="w-[110px]" />
                        <col className="min-w-[120px]" />
                        <col className="min-w-[180px]" />
                        <col className="w-[64px]" />
                    <col className="w-[78px]" />
                    <col className="w-[56px]" />
                    <col className="w-[72px]" />
                    <col className="w-[88px]" />
                    <col className="w-[44px]" />
                    <col className="w-[44px]" />
                    <col className="w-[44px]" />
                  </colgroup>
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2.5 text-left">Photo · Map</th>
                      <th className="px-2 py-2.5 text-left">Unit</th>
                      <th className="px-2 py-2.5 text-left">Market</th>
                      <th className="px-2 py-2.5 text-left">Format</th>
                      <th className="px-2 py-2.5 text-left">Location</th>
                      <th className="px-2 py-2.5 text-left">Highlights</th>
                      <th className="px-2 py-2.5 text-right">4wk Imp</th>
                      <th className="px-2 py-2.5 text-right">Total</th>
                      <th className="px-2 py-2.5 text-right">CPM</th>
                      <th className="px-2 py-2.5 text-center bg-muted/60">Include</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--accent-gold)/0.18)]">Recommend</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">A</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">B</th>
                      <th className="px-2 py-2.5 text-center bg-[hsl(var(--ocean)/0.10)]">C</th>
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
                          <td className="px-2 py-2 align-top">
                            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-start gap-1">
                                {/* Billboard photo */}
                                <div className="flex flex-col items-center gap-0.5">
                                  {u.billboard_photo_url ? (
                                    <div className="relative h-10 w-14 overflow-hidden rounded bg-muted">
                                      <img
                                        src={u.billboard_photo_url}
                                        alt={`Unit ${u.unit_number}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                      {u.low_res_flag && (
                                        <span
                                          title="Low-resolution photo"
                                          className="absolute top-0 right-0 flex h-3 w-3 items-center justify-center rounded-bl bg-warning/90 text-warning-foreground"
                                        >
                                          <AlertCircle className="h-2 w-2" />
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      className="flex h-10 w-14 items-center justify-center rounded bg-muted text-muted-foreground"
                                      title="No photo"
                                    >
                                      <ImageOff className="h-3 w-3" />
                                    </div>
                                  )}
                                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Photo</span>
                                </div>
                                {/* Map photo */}
                                <div className="flex flex-col items-center gap-0.5">
                                  {u.inset_map_url ? (
                                    <div className="relative h-10 w-14 overflow-hidden rounded border border-border bg-muted">
                                      <img
                                        src={u.inset_map_url}
                                        alt={`Map for unit ${u.unit_number}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className="flex h-10 w-14 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-muted-foreground"
                                      title="No map"
                                    >
                                      <MapPin className="h-3 w-3" />
                                    </div>
                                  )}
                                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Map</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
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
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top font-medium">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="truncate">{u.unit_number}</span>
                              {u.recommended && (
                                <Badge className="bg-success/15 text-success border border-success/30 gap-0.5 px-1 py-0 text-[9px]">
                                  <Sparkles className="h-2.5 w-2.5" /> Rec
                                </Badge>
                              )}
                              {u.latitude != null && u.longitude != null && (
                                <MapPin className="h-2.5 w-2.5 text-[hsl(var(--accent-gold))]" />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{u.vendor}</div>
                          </td>
                          <td className="px-2 py-2 align-top text-muted-foreground">
                            <span className="block truncate">{u.market ?? "—"}</span>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="truncate">{u.format ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {u.size ?? ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="font-medium text-foreground break-words leading-snug">
                              {parseShortAddress(u.location_description) || "—"}
                            </div>
                            <div
                              className="mt-0.5 text-[10px] text-muted-foreground leading-snug break-words"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {u.location_description ?? ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                            <HighlightsCell
                              unitId={u.id}
                              unitNumber={u.unit_number}
                              initial={u.highlights}
                              onSaved={(next) =>
                                setUnits((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, highlights: next } : x)),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]">
                            {fmtNum(u.four_week_impressions)}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]">
                            {fmtMoney(u.total_cost)}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-[11px]">
                            {u.cpm == null ? "—" : `$${u.cpm.toFixed(2)}`}
                          </td>
                          <td
                            className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--accent-gold)/0.10)]" : "bg-muted/30"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={u.included !== false}
                              onCheckedChange={(v) => toggleField(u, "included", v)}
                            />
                          </td>
                          <td
                            className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--accent-gold)/0.22)]" : "bg-[hsl(var(--accent-gold)/0.12)]"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={!!u.recommended}
                                onCheckedChange={(v) => toggleField(u, "recommended", v)}
                                disabled={excluded}
                              />
                            </div>
                          </td>
                          {TIERS.map((t) => (
                            <td
                              key={t.key}
                              className={`px-2 py-2 align-top text-center border-l border-border ${isHighlighted ? "bg-[hsl(var(--ocean)/0.14)]" : "bg-[hsl(var(--ocean)/0.06)]"}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center">
                                <Switch
                                  checked={!!u[t.key]}
                                  onCheckedChange={(v) => toggleField(u, t.key, v)}
                                  disabled={excluded}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {id && (
            <CampaignFilesHistory
              campaignId={id}
              units={units.map((u) => ({ id: u.id, unit_number: u.unit_number }))}
              onUnitChanged={load}
            />
          )}
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
      {campaign && (
        <ReuploadFilesDialog
          open={reuploadOpen}
          onOpenChange={setReuploadOpen}
          campaignId={campaign.id}
          onDone={async () => {
            await load();
            extractPhotos({ silent: true });
          }}
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
