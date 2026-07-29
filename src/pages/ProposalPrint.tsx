import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Calendar, Sparkles, ImageOff, Mail, Phone, Globe, Instagram } from "lucide-react";
import { format } from "date-fns";
import brand from "@/config/brand.json";
import { Logo } from "@/components/Logo";
import { WhoWeAre } from "@/components/WhoWeAre";
import { MeetTheTeam } from "@/components/MeetTheTeam";
import { parseShortAddress, displayAddress } from "@/lib/shortAddress";
import { useProposalSettings } from "@/hooks/useProposalSettings";
import { cleanHighlight } from "@/lib/cleanHighlight";
import { useToast } from "@/hooks/use-toast";
import { flightRateLabel, flightRateValue, flightImpressionsLabel, flightImpressionsValue } from "@/lib/format";


type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  proposal_name: string | null;
  client_logo_url: string | null;
  cover_image_url: string | null;
  vendor_overview_map_url: string | null;
  flight_start: string | null;
  flight_end: string | null;
  markets: string[] | null;
  show_tier_a: boolean | null;
  show_tier_b: boolean | null;
  show_tier_c: boolean | null;
  option_a_start: string | null;
  option_a_end: string | null;
  option_b_start: string | null;
  option_b_end: string | null;
  option_c_start: string | null;
  option_c_end: string | null;
  margin_pct: number | null;
};

type Unit = {
  id: string;
  unit_number: string;
  market: string | null;
  format: string | null;
  size: string | null;
  location_description: string | null;
  address: string | null;
  insight_bullets: string[] | null;
  highlights: string | null;
  weekly_impressions: number | null;
  four_week_impressions: number | null;
  total_cost: number | null;
  negotiated_rate_4wk: number | null;
  four_week_periods: number | null;
  production_cost: number | null;
  install_cost: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
  inset_map_url: string | null;
  geopath_id: string | null;
  media_type: string | null;
  facing: string | null;
  city: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  tier_a: boolean | null;
  tier_b: boolean | null;
  tier_c: boolean | null;
};

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const parseLocalDate = (s: string) => {
  // Parse YYYY-MM-DD as LOCAL midnight so date-only values don't shift by
  // one day in US timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
};
const fmtDateShort = (d: string | null) => (d ? format(parseLocalDate(d), "M/d/yyyy") : "—");
const fmtPeriods = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  const label = rounded === 1 ? "period" : "periods";
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${str} ${label}`;
};
const fmtTierRange = (s: string | null, e: string | null): string | null => {
  if (!s || !e) return null;
  const sd = parseLocalDate(s);
  const ed = parseLocalDate(e);
  return sd.getFullYear() === ed.getFullYear()
    ? `${format(sd, "MMM d")} – ${format(ed, "MMM d, yyyy")}`
    : `${format(sd, "MMM d, yyyy")} – ${format(ed, "MMM d, yyyy")}`;
};

/* ─── Branding colours for section pages ─── */
const NAVY = "#0A1628";
const NAVY_LIGHT = "#122040";
const GOLD = "#C9A84C";
const OCEAN = "#3B82F6";
const WHITE = "#FFFFFF";
const MUTED = "#94A3B8";

/* ─── Quote page colours (white background) ─── */
const Q_NAVY = "#0F2A44";
const Q_GOLD = "#C9A24A";
const Q_GREY = "#6B7280";
const Q_BORDER = "#E5E7EB";
const Q_SOFT = "#F8FAFC";

export default function ProposalPrint() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportState, setExportState] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const settings = useProposalSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRanRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      const [c, u] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, client_name, campaign_name, proposal_name, client_logo_url, cover_image_url, vendor_overview_map_url, flight_start, flight_end, markets, show_tier_a, show_tier_b, show_tier_c, option_a_start, option_a_end, option_b_start, option_b_end, option_c_start, option_c_end, margin_pct")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("units")
          .select(
            "id, unit_number, market, format, size, location_description, address, insight_bullets, highlights, weekly_impressions, four_week_impressions, total_cost, negotiated_rate_4wk, four_week_periods, production_cost, install_cost, cpm, recommended, included, billboard_photo_url, inset_map_url, geopath_id, media_type, facing, city, zip, latitude, longitude, tier_a, tier_b, tier_c",
          )
          .eq("campaign_id", campaignId)
          .order("market", { ascending: true })
          .order("unit_number", { ascending: true }),
      ]);
      if (c.data) setCampaign(c.data as Campaign);
      const filtered = ((u.data ?? []) as Unit[]).filter((x) => x.included !== false);
      const seen = new Set<string>();
      const deduped: Unit[] = [];
      for (const unit of filtered) {
        const key = (unit.unit_number || "").trim().toLowerCase();
        if (!key) { deduped.push(unit); continue; }
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(unit);
      }
      setUnits(deduped);
      setLoading(false);
    })();
  }, [campaignId]);

  const runExport = async () => {
    if (!containerRef.current) return;
    setExportState("generating");
    setExportError(null);
    try {
      // Wait for images + fonts before invoking the browser print dialog so
      // pages don't rasterize with blank photos.
      const images = Array.from(containerRef.current.querySelectorAll("img"));
      await Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }),
      );
      try {
        if ((document as any).fonts?.ready) await (document as any).fonts.ready;
      } catch { /* ignore */ }
      window.print();
      setExportState("done");
    } catch (e: any) {
      console.error(e);
      setExportError(e?.message ?? "PDF generation failed, please try again.");
      setExportState("error");
      toast({
        title: "PDF export failed",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Auto-trigger print once data + first paint are ready.
  useEffect(() => {
    if (loading || !campaign || autoRanRef.current) return;
    autoRanRef.current = true;
    const t = setTimeout(() => { runExport(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, campaign]);

  // If the tab was opened programmatically (Download button), close it after
  // the user finishes/cancels the browser print dialog.
  useEffect(() => {
    const onAfterPrint = () => {
      setTimeout(() => {
        try { if (window.opener) window.close(); } catch { /* ignore */ }
      }, 300);
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading proposal…</span>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Proposal unavailable.</p>
      </div>
    );
  }

  const heroPhoto =
    campaign.cover_image_url ?? units.find((u) => u.billboard_photo_url)?.billboard_photo_url ?? null;
  const flightLabel = `${fmtDateShort(campaign.flight_start)} – ${fmtDateShort(campaign.flight_end)}`;
  const primaryMarket = campaign.markets?.[0] ?? "—";

  /* Build market-indexed unit numbering: 01.01, 01.02, 02.01 … */
  const marketMap = new Map<string, number>();
  let marketCounter = 0;
  const unitLabels = units.map((u) => {
    const m = u.market ?? "Other";
    if (!marketMap.has(m)) marketMap.set(m, ++marketCounter);
    const mIdx = marketMap.get(m)!;
    const withinMarket = units.filter((x) => (x.market ?? "Other") === m).indexOf(u) + 1;
    return `${String(mIdx).padStart(2, "0")}.${String(withinMarket).padStart(2, "0")}`;
  });

  const activeTiers = [
    campaign.show_tier_a && { key: 'tier_a' as const, label: 'Option A', dateRange: fmtTierRange(campaign.option_a_start, campaign.option_a_end) },
    campaign.show_tier_b && { key: 'tier_b' as const, label: 'Option B', dateRange: fmtTierRange(campaign.option_b_start, campaign.option_b_end) },
    campaign.show_tier_c && { key: 'tier_c' as const, label: 'Option C', dateRange: fmtTierRange(campaign.option_c_start, campaign.option_c_end) },
  ].filter(Boolean) as { key: 'tier_a' | 'tier_b' | 'tier_c'; label: string; dateRange: string | null }[];

  return (
    <>
      <style>{`
        @page {
          size: Letter portrait;
          margin: 0;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          *, *::before, *::after {
            animation: none !important;
            animation-duration: 0s !important;
            transition: none !important;
            transform: none !important;
          }
          body { margin: 0; }
          nav, header, footer, .sticky, .no-print { display: none !important; }
          .print-section-page { page-break-after: always; page-break-inside: avoid; }
          .print-unit-page {
            page-break-after: always;
            page-break-inside: avoid;
            padding: 0.5in !important;
          }
          img[src=""], img:not([src]) { display: none; }

          /* ── Cover: never bleed onto a second page ── */
          .print-cover-section {
            max-height: 100vh !important;
            overflow: hidden !important;
            page-break-after: always !important;
          }

          /* ── Who We Are: kill stacked watermark + decorative layers ── */
          .print-who-wrapper [aria-hidden="true"] { display: none !important; }
          .print-who-wrapper [style*="opacity: 0"],
          .print-who-wrapper [style*="opacity:0"] { opacity: 1 !important; }

          /* ── Meet The Team: keep all 3 cards on one page ── */
          .print-team-section { page-break-inside: avoid !important; }
          .print-team-section section { padding-top: 40px !important; padding-bottom: 40px !important; }
          .print-team-section .grid {
            display: flex !important;
            flex-wrap: nowrap !important;
            gap: 16px !important;
            justify-content: center !important;
          }
          .print-team-section .grid > * {
            flex: 0 0 30% !important;
            page-break-inside: avoid !important;
            padding: 16px !important;
          }
          .print-team-section .grid img {
            width: 110px !important;
            height: 110px !important;
          }
          .print-team-section .grid .h-44 {
            height: 110px !important;
            width: 110px !important;
          }

          /* ── Dark navy section pages: readable text + trim height ── */
          .print-dark-section {
            background-color: #0A1628 !important;
            min-height: 0 !important;
            height: auto !important;
            padding-top: 60px !important;
            padding-bottom: 60px !important;
          }
          .print-dark-section h1,
          .print-dark-section h2,
          .print-dark-section h3,
          .print-dark-section p,
          .print-dark-section span,
          .print-dark-section div,
          .print-dark-section a,
          .print-dark-section blockquote {
            color: #ffffff !important;
          }
          .print-dark-section .gold-text,
          .print-dark-section [data-gold] { color: #C9A84C !important; }
          .print-dark-section .step-circle {
            border-color: #C9A84C !important;
            color: #C9A84C !important;
          }
        }
        @media screen {
          .print-page-wrapper { max-width: 820px; margin: 0 auto; }
          .print-unit-page { margin-bottom: 40px; border: 1px solid #e5e7eb; border-radius: 8px; }
          .print-section-page { margin-bottom: 40px; }
        }
      `}</style>

      <div className="print-page-wrapper" ref={containerRef}>
        {/* Screen-only status bar (does not appear in exported PDF) */}
        <div className="no-print p-4 bg-muted flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {exportState === "generating" && "Generating your proposal PDF — this can take a moment for large decks…"}
            {exportState === "done" && "PDF downloaded. You can close this tab."}
            {exportState === "error" && (exportError || "PDF generation failed.")}
            {exportState === "idle" && "Preparing proposal…"}
          </span>
          <button
            onClick={runExport}
            disabled={exportState === "generating"}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            {exportState === "generating" ? "Generating…" : exportState === "error" ? "Retry download" : "Download PDF"}
          </button>
        </div>

        {/* ===== COVER PAGE ===== */}
        <section data-pdf-page className="print-section-page print-cover-section" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden" }}>

          {heroPhoto && (
            <div style={{ position: "absolute", inset: 0, opacity: 0.15 }}>
              <img src={heroPhoto} alt="" loading="eager" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div style={{ position: "relative", zIndex: 1, padding: "40px" }}>
            <Logo size={56} variant="onDark" />
            <div style={{ marginTop: 32, height: 3, width: 80, background: GOLD, borderRadius: 2, margin: "32px auto 0" }} />
            <h1 style={{ marginTop: 28, fontFamily: "Montserrat, sans-serif", fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1, color: WHITE }}>
              {campaign.proposal_name || campaign.campaign_name}
            </h1>
            <p style={{ marginTop: 10, fontSize: 14, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>
              Outdoor Media Proposal
            </p>
            <p style={{ marginTop: 24, fontSize: 16, color: MUTED }}>
              Prepared for <span style={{ fontWeight: 700, color: WHITE }}>{campaign.client_name}</span>
            </p>
            {campaign.client_logo_url && (
              <img src={campaign.client_logo_url} alt={campaign.client_name} loading="eager" style={{ marginTop: 28, height: 48, width: "auto", margin: "28px auto 0", borderRadius: 6, background: "rgba(255,255,255,0.9)", padding: 6 }} />
            )}
          </div>
        </section>

        {/* ===== WHO WE ARE ===== */}
        <div data-pdf-page className="print-section-page print-who-wrapper">
          <WhoWeAre />
        </div>

        {/* ===== CAMPAIGN COVERAGE MAP ===== */}
        {campaign.vendor_overview_map_url && (
          <section data-pdf-page className="print-section-page print-dark-section" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 80px" }}>

            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>Coverage</p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 36, fontWeight: 800, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>Campaign Coverage Map</h2>
            <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 32, margin: "0 auto 32px" }} />
            <img src={campaign.vendor_overview_map_url} alt="Campaign coverage map" loading="eager" crossOrigin="anonymous" style={{ maxWidth: "85%", height: "auto", borderRadius: 12 }} />
          </section>
        )}

        {/* ===== CAMPAIGN OPTIONS SUMMARY ===== */}
        {activeTiers.length >= 2 && (
          <section data-pdf-page className="print-section-page" style={{ background: "#ffffff", padding: "60px 64px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>

            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: Q_GOLD, fontWeight: 600, marginBottom: 12 }}>Choose Your Option</p>
              <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 32, fontWeight: 800, textTransform: "uppercase", color: Q_NAVY, marginBottom: 12 }}>Campaign Options</h2>
              <div style={{ height: 3, width: 64, background: Q_GOLD, borderRadius: 2, margin: "0 auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeTiers.length}, 1fr)`, gap: 20 }}>
              {activeTiers.map((tier) => {
                const tierUnits = units.filter((u) => u.included !== false && u[tier.key]);
                const marginMult = 1 + ((campaign?.margin_pct ?? 0) / 100);
                const fourWeekRate = tierUnits.reduce((s, u) => s + (u.negotiated_rate_4wk ?? 0) * marginMult, 0);
                const totalImpressions = tierUnits.reduce((s, u) => s + flightImpressionsValue(u.four_week_impressions, u.four_week_periods), 0);
                const totalPeriods = tierUnits.reduce((s, u) => s + (u.four_week_periods ?? 0), 0);
                const totalCampaignCost = tierUnits.reduce((s, u) => s + (u.negotiated_rate_4wk ?? 0) * marginMult * (u.four_week_periods ?? 0), 0);
                const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8 };
                const labelStyle: React.CSSProperties = { color: Q_GREY };
                const valStyle: React.CSSProperties = { color: Q_NAVY, fontWeight: 600 };
                return (
                  <div key={tier.key} style={{ border: `1px solid ${Q_BORDER}`, borderRadius: 12, padding: 24, background: Q_SOFT, display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: Q_GREY, fontWeight: 700 }}>{tier.label}</p>
                    {tier.dateRange && (
                      <p style={{ fontSize: 12, color: Q_NAVY, fontWeight: 500, marginTop: -4 }}>{tier.dateRange}</p>
                    )}
                    <div style={{ borderTop: `1px solid ${Q_BORDER}`, paddingTop: 4 }}>
                      <div style={rowStyle}><span style={labelStyle}>Placements</span><span style={valStyle}>{tierUnits.length} units</span></div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>Four-Week Rate</span>
                        <span style={valStyle}>{fourWeekRate > 0 ? `$${fourWeekRate.toLocaleString()}` : <span style={{ color: Q_GREY, fontWeight: 400, fontStyle: "italic" }}>Contact for pricing</span>}</span>
                      </div>
                      {totalImpressions > 0 && (
                        <div style={rowStyle}><span style={labelStyle}>Four-Week Impressions</span><span style={valStyle}>{totalImpressions.toLocaleString()}</span></div>
                      )}
                      {totalCampaignCost > 0 && (
                        <div style={rowStyle}>
                          <span style={labelStyle}>Total Campaign Cost</span>
                          <span style={valStyle}>
                            {totalPeriods > 0 && (
                              <span style={{ color: Q_GREY, fontWeight: 400 }}>{fmtPeriods(totalPeriods)} · </span>
                            )}
                            ${totalCampaignCost.toLocaleString()} total
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== UNIT QUOTE PAGES (white, matching Portal PDF) ===== */}
        {units.map((unit, idx) => (
          <div key={unit.id} data-pdf-page className="print-unit-page" style={{ background: "#ffffff", padding: 16 }}>

            <PrintableQuote
              unit={unit}
              market={unit.market ?? "Other"}
              campaign={campaign}
              indexLabel={unitLabels[idx]}
            />
          </div>
        ))}

        {/* ===== NEXT STEPS ===== */}
        <section data-pdf-page className="print-section-page print-dark-section" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 80px" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>03 · Process</p>
          <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 40, fontWeight: 800, textTransform: "uppercase", marginBottom: 16 }}>{settings.next_steps_heading || "Next Steps"}</h2>
          <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: settings.next_steps_body ? 24 : 48 }} />
          {settings.next_steps_body && (
            <p style={{ maxWidth: 720, textAlign: "center", color: WHITE, fontSize: 14, lineHeight: 1.6, marginBottom: 40, whiteSpace: "pre-line" }}>
              {settings.next_steps_body}
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32, maxWidth: 900, width: "100%" }}>
            {[
              { n: "01", title: "Review & Feedback", body: "Walk through the proposal and share questions." },
              { n: "02", title: "Final Approval", body: "Confirm the unit list and flight dates." },
              { n: "03", title: "Insertion Order", body: "Sign IOs and lock vendor inventory." },
              { n: "04", title: "Campaign Goes Live", body: "Creative installed, monitoring begins." },
            ].map((s) => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div className="step-circle" style={{ width: 56, height: 56, borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18, fontWeight: 700, color: GOLD }}>{s.n}</div>
                <h3 style={{ marginTop: 16, fontFamily: "Montserrat, sans-serif", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: WHITE }}>{s.title}</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: WHITE, lineHeight: 1.5 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== MEET THE TEAM ===== */}
        <div data-pdf-page className="print-section-page print-team-section">
          <MeetTheTeam />
        </div>

        {/* ===== CLOSING CTA ===== */}
        <section data-pdf-page className="print-section-page print-dark-section" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "grid", gridTemplateColumns: "40% 60%" }}>

          <div style={{ background: NAVY_LIGHT, padding: "60px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Logo size={48} variant="onDark" />
            <p style={{ marginTop: 28, fontFamily: "Montserrat, sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.25em", color: WHITE }}>{settings.company_name || "Coastal Maverick"}</p>
            <div style={{ height: 2, width: 48, background: GOLD, borderRadius: 2, marginTop: 16 }} />
            <blockquote style={{ marginTop: 28, fontStyle: "italic", fontSize: 17, color: GOLD, lineHeight: 1.6 }}>"Positioned where your audience moves."</blockquote>
          </div>
          <div style={{ padding: "60px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>For {campaign.client_name}</p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 48, fontWeight: 800, textTransform: "uppercase", lineHeight: 0.95, color: WHITE }}>Let's Get<br />To Work.</h2>
            <div style={{ height: 3, width: 80, background: GOLD, borderRadius: 2, marginTop: 20 }} />
            <div style={{ marginTop: 36 }}>
              <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: WHITE }}>Heather Waisanen</p>
              <p style={{ fontSize: 13, color: MUTED }}>Founder & CEO</p>
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <a href={`mailto:${settings.company_email || "heather.waisanen@gmail.com"}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Mail className="h-4 w-4" /> {settings.company_email || "heather.waisanen@gmail.com"}
              </a>
              {settings.company_phone && (
                <a href={`tel:${settings.company_phone.replace(/[^0-9+]/g, "")}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                  <Phone className="h-4 w-4" /> {settings.company_phone}
                </a>
              )}
              <a href="https://www.instagram.com/coastalmaverick/" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Instagram className="h-4 w-4" /> @coastalmaverick
              </a>
              <a href="https://www.coastalmaverick.com/" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Globe className="h-4 w-4" /> coastalmaverick.com
              </a>
            </div>
            {settings.footer_tagline && (
              <p style={{ marginTop: 32, fontSize: 12, color: MUTED, whiteSpace: "pre-line", lineHeight: 1.5 }}>
                {settings.footer_tagline}
              </p>
            )}

          </div>
        </section>
      </div>
    </>
  );
}

/* ====================================================================
   PrintableQuote — exact copy from Portal.tsx
   White background, black text, clean quote layout
   ==================================================================== */

function PrintableQuote({
  unit,
  market,
  indexLabel,
  campaign,
}: {
  unit: Unit;
  market: string;
  indexLabel: string;
  campaign: Campaign | null;
}) {
  return (
    <article
      style={{
        background: "#ffffff",
        color: "#111827",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "8px",
      }}
    >
      {/* Brand header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `3px solid ${Q_GOLD}`,
          paddingBottom: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.25em", color: Q_NAVY, fontWeight: 700 }}>
            COASTAL MAVERICK · {market.toUpperCase()}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: Q_NAVY, marginTop: 2 }}>
            {campaign?.proposal_name || campaign?.campaign_name || "Proposal"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: Q_GREY }}>QUOTE</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: Q_NAVY, lineHeight: 1 }}>
            {indexLabel}
          </div>
        </div>
      </div>

      {/* Title row */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: Q_GREY, fontWeight: 600 }}>
          UNIT #{unit.unit_number}
          {unit.recommended ? "  ·  ★ RECOMMENDED" : ""}
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#111827",
            margin: "4px 0 0",
            lineHeight: 1.2,
          }}
        >
          {displayAddress(unit) || unit.format || "Premium Placement"}
        </h2>
        {unit.location_description && (
          <div style={{ fontSize: 11, color: Q_GREY, marginTop: 2 }}>{unit.location_description}</div>
        )}
      </div>

      {/* Photos row — collapse to single column when no map exists */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: unit.inset_map_url ? "1fr 1fr" : "1fr",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <PhotoBox label="Location photo" src={unit.billboard_photo_url} />
        {unit.inset_map_url && (
          <PhotoBox label="Location map" src={unit.inset_map_url} />
        )}
      </div>


      {/* Highlights */}
      {cleanHighlight(unit.highlights) && (
        <div
          style={{
            background: Q_SOFT,
            borderLeft: `3px solid ${Q_GOLD}`,
            padding: "8px 10px",
            marginBottom: 12,
            fontSize: 11,
            lineHeight: 1.55,
            color: "#1F2937",
          }}
        >
          {cleanHighlight(unit.highlights)}
        </div>
      )}

      {/* Structured details + Investment */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <DetailBlock title="Quote details">
          {unit.geopath_id && <Row k="Geopath ID" v={unit.geopath_id} />}
          {unit.media_type && <Row k="Media Type" v={unit.media_type} />}
          {unit.facing && <Row k="Facing" v={unit.facing} />}
          {unit.size && <Row k="Size" v={unit.size} />}
          {unit.city && <Row k="City" v={unit.city} />}
          {unit.zip && <Row k="Zip" v={unit.zip} />}
          {unit.latitude != null && <Row k="Latitude" v={unit.latitude.toFixed(5)} />}
          {unit.longitude != null && <Row k="Longitude" v={unit.longitude.toFixed(5)} />}
        </DetailBlock>

        <DetailBlock title="Performance & Investment">
          {unit.weekly_impressions != null && (
            <Row k="Weekly Impressions" v={fmtNum(unit.weekly_impressions)} />
          )}
          {unit.four_week_impressions != null && (
            <Row k={flightImpressionsLabel(unit.four_week_periods)} v={fmtNum(flightImpressionsValue(unit.four_week_impressions, unit.four_week_periods))} />
          )}
          {unit.cpm != null && <Row k="CPM" v={`$${unit.cpm.toFixed(2)}`} />}
          <div style={{ borderTop: `1px solid ${Q_BORDER}`, margin: "6px 0" }} />
          {unit.production_cost != null && (
            <Row k="Production" v={fmtMoney(unit.production_cost)} />
          )}
          {unit.install_cost != null && (
            <Row k="Install" v={fmtMoney(unit.install_cost)} />
          )}
          <Row k={flightRateLabel(unit.four_week_periods)} v={fmtMoney(flightRateValue(unit.negotiated_rate_4wk, 1 + ((campaign?.margin_pct ?? 0) / 100), unit.four_week_periods))} bold />

        </DetailBlock>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 8,
          borderTop: `1px solid ${Q_BORDER}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: Q_GREY,
          letterSpacing: "0.05em",
        }}
      >
        <span>coastalmaverick.com</span>
        <span>{campaign?.client_name ?? ""}</span>
      </div>
    </article>
  );
}

function PhotoBox({ src, label }: { src: string | null; label: string }) {
  return (
    <div style={{ border: `1px solid ${Q_BORDER}`, borderRadius: 6, overflow: "hidden", background: "#F3F4F6" }}>
      {src ? (
        <img
          src={src}
          alt={label}
          loading="eager"
          crossOrigin="anonymous"
          style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: Q_GREY, fontSize: 11 }}>
          No image available
        </div>
      )}
      <div style={{ padding: "4px 8px", fontSize: 9, letterSpacing: "0.18em", color: Q_GREY, fontWeight: 600, textTransform: "uppercase" as const, background: "#fff" }}>
        {label}
      </div>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${Q_BORDER}`, borderRadius: 6, background: Q_SOFT, padding: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", color: Q_NAVY, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${Q_BORDER}` }}>
        {title}
      </div>
      <dl style={{ margin: 0 }}>{children}</dl>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: 10.5 }}>
      <dt style={{ color: Q_GREY, margin: 0 }}>{k}</dt>
      <dd style={{ margin: 0, color: "#111827", fontWeight: bold ? 700 : 500, textAlign: "right" }}>{v}</dd>
    </div>
  );
}
