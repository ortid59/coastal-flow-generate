import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Calendar, Sparkles, ImageOff, Eye, DollarSign, Ruler, TrendingUp, Mail, Globe, Instagram } from "lucide-react";
import { format } from "date-fns";
import brand from "@/config/brand.json";
import { Logo } from "@/components/Logo";
import { parseShortAddress } from "@/lib/shortAddress";
import { fmtCostLine } from "@/lib/format";
import heatherPhoto from "@/assets/team-heather.jpg";
import viaPhoto from "@/assets/team-via.webp";
import roxiePhoto from "@/assets/team-roxie.jpg";

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
};

type Unit = {
  id: string;
  unit_number: string;
  market: string | null;
  format: string | null;
  size: string | null;
  location_description: string | null;
  insight_bullets: string[] | null;
  highlights: string | null;
  weekly_impressions: number | null;
  four_week_impressions: number | null;
  total_cost: number | null;
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
  tier_a: boolean | null;
  tier_b: boolean | null;
  tier_c: boolean | null;
};

const NAVY = "#0A1628";
const NAVY_LIGHT = "#122040";
const GOLD = "#C9A84C";
const OCEAN = "#3B82F6";
const WHITE = "#FFFFFF";
const MUTED = "#94A3B8";

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDateShort = (d: string | null) => (d ? format(new Date(d), "M/d/yyyy") : "—");

export default function ProposalPrint() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      const [c, u] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, client_name, campaign_name, proposal_name, client_logo_url, cover_image_url, vendor_overview_map_url, flight_start, flight_end, markets, show_tier_a, show_tier_b, show_tier_c")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("units")
          .select(
            "id, unit_number, market, format, size, location_description, insight_bullets, highlights, weekly_impressions, four_week_impressions, total_cost, production_cost, install_cost, cpm, recommended, included, billboard_photo_url, inset_map_url, geopath_id, media_type, facing, city, zip, tier_a, tier_b, tier_c",
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

  // Auto-trigger print dialog once loaded
  useEffect(() => {
    if (!loading && campaign) {
      const t = setTimeout(() => window.print(), 1200);
      return () => clearTimeout(t);
    }
  }, [loading, campaign]);

  const activeTiers = useMemo(() => [
    campaign?.show_tier_a && { key: 'tier_a' as const, label: 'Option A' },
    campaign?.show_tier_b && { key: 'tier_b' as const, label: 'Option B' },
    campaign?.show_tier_c && { key: 'tier_c' as const, label: 'Option C' },
  ].filter(Boolean) as { key: 'tier_a' | 'tier_b' | 'tier_c'; label: string }[], [campaign]);

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

  const team = [
    { name: "Heather", role: "Founder & CEO", photo: heatherPhoto },
    { name: "Via", role: "Creative Media Coordinator", photo: viaPhoto },
    { name: "Roxie", role: "Chief Happiness Officer", photo: roxiePhoto },
  ];

  return (
    <>
      <style>{`
        @page { size: Letter landscape; margin: 0; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          *, *::before, *::after { animation: none !important; transition: none !important; }
          body { margin: 0; }
          nav, header, footer, .sticky, .no-print { display: none !important; }
          .print-cover { height: 100vh; overflow: hidden; page-break-after: always; }
          .print-section-page { page-break-after: always; page-break-inside: avoid; }
          .print-unit-page { page-break-after: always; page-break-inside: avoid; min-height: 100vh; }
          img[src=""], img:not([src]) { display: none; }
        }
        @media screen {
          .print-page-wrapper { max-width: 1100px; margin: 0 auto; }
        }
      `}</style>

      <div className="print-page-wrapper">
        {/* Screen-only info bar */}
        <div className="no-print p-4 bg-muted flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Full proposal preview — use your browser's Print / Save as PDF to download.
          </span>
          <button
            onClick={() => window.print()}
            className="text-sm font-medium text-primary hover:underline"
          >
            Print / Save PDF
          </button>
        </div>

        {/* ===== PAGE 1 — COVER ===== */}
        <section className="print-cover" style={{ background: NAVY, color: WHITE, height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden" }}>
          {/* Background hero image overlay */}
          {heroPhoto && (
            <div style={{ position: "absolute", inset: 0, opacity: 0.15 }}>
              <img src={heroPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <div style={{ marginTop: 28, display: "flex", gap: 32, justifyContent: "center", fontSize: 13, color: MUTED }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar className="h-4 w-4" style={{ color: GOLD }} />
                {flightLabel}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin className="h-4 w-4" style={{ color: GOLD }} />
                {primaryMarket}
              </span>
            </div>
            {campaign.client_logo_url && (
              <img src={campaign.client_logo_url} alt={campaign.client_name} style={{ marginTop: 28, height: 48, width: "auto", margin: "28px auto 0", borderRadius: 6, background: "rgba(255,255,255,0.9)", padding: 6 }} />
            )}
          </div>
        </section>

        {/* ===== PAGE 2 — WHO WE ARE ===== */}
        <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", alignItems: "center", padding: "60px 80px" }}>
          <div style={{ maxWidth: 900 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
              About the Agency
            </p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 44, fontWeight: 800, textTransform: "uppercase", lineHeight: 1, marginBottom: 16 }}>
              Who <span style={{ color: OCEAN }}>We Are</span>
            </h2>
            <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 28 }} />
            <p style={{ fontSize: 16, lineHeight: 1.7, color: MUTED, marginBottom: 16 }}>
              <span style={{ fontWeight: 700, color: WHITE }}>Coastal Maverick</span> is a woman-owned boutique out-of-home (OOH) media agency specializing in high-impact, highly customized OOH campaigns. From concept to completion, we serve as a strategic partner for brands looking to make a bold visual statement in the physical world.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: MUTED, marginBottom: 28 }}>
              With 360-degree experience across media owner, client, and agency sides, we bring a unique perspective that fuels smarter strategy and greater impact.
            </p>
            <div style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 20 }}>
              {["Woman-Owned.", "Boutique.", "Built for Impact."].map((t) => (
                <p key={t} style={{ fontFamily: "Montserrat, sans-serif", fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, color: WHITE }}>
                  {t}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* ===== PAGE 3 — CAMPAIGN COVERAGE MAP ===== */}
        {campaign.vendor_overview_map_url && (
          <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 80px" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
              Coverage
            </p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 36, fontWeight: 800, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>
              Campaign Coverage Map
            </h2>
            <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 32, margin: "0 auto 32px" }} />
            <img
              src={campaign.vendor_overview_map_url}
              alt="Campaign coverage map"
              style={{ maxWidth: "85%", height: "auto", borderRadius: 12 }}
            />
          </section>
        )}

        {/* ===== PAGE 4 — CAMPAIGN OPTIONS ===== */}
        {activeTiers.length >= 2 && (
          <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 80px" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
              Choose Your Option
            </p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 36, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
              Campaign Options
            </h2>
            <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 40 }} />

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeTiers.length}, 1fr)`, gap: 24 }}>
              {activeTiers.map((tier) => {
                const tierUnits = units.filter((u) => u.included && u[tier.key]);
                const totalCost = tierUnits.reduce((sum, u) => sum + (u.total_cost ?? 0), 0);
                const totalImpressions = tierUnits.reduce((sum, u) => sum + (u.four_week_impressions ?? 0), 0);
                return (
                  <div key={tier.key} style={{ border: `2px solid ${GOLD}`, borderRadius: 16, padding: 28, background: NAVY_LIGHT }}>
                    <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, fontWeight: 700, marginBottom: 8 }}>
                      {tier.label}
                    </p>
                    {totalCost > 0 ? (
                      <p style={{ fontSize: 32, fontWeight: 800, color: WHITE }}>{fmtMoney(totalCost)}</p>
                    ) : (
                      <p style={{ fontSize: 18, fontWeight: 600, color: MUTED, fontStyle: "italic" }}>Contact for pricing</p>
                    )}
                    <div style={{ borderTop: `1px solid rgba(255,255,255,0.1)`, marginTop: 16, paddingTop: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                        <span style={{ color: MUTED }}>Placements</span>
                        <span style={{ fontWeight: 700, color: WHITE }}>{tierUnits.length} units</span>
                      </div>
                      {totalImpressions > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: MUTED }}>4-Week Impressions</span>
                          <span style={{ fontWeight: 700, color: WHITE }}>{fmtNum(totalImpressions)}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ borderTop: `1px solid rgba(255,255,255,0.1)`, marginTop: 16, paddingTop: 16 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: GOLD, fontWeight: 600, marginBottom: 8 }}>Includes</p>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {tierUnits.map((u) => (
                          <li key={u.id} style={{ fontSize: 12, color: MUTED, marginBottom: 3 }}>
                            • {u.location_description ?? u.unit_number}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== UNIT PAGES ===== */}
        {units.map((unit, idx) => (
          <section key={unit.id} className="print-unit-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", padding: 0 }}>
            {/* Dark navy header bar */}
            <div style={{ background: NAVY_LIGHT, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: GOLD }}>
                  #{unit.unit_number}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>
                  {parseShortAddress(unit.location_description) || unit.format || "Premium Placement"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: MUTED }}>
                {unit.market && <span>{unit.market}</span>}
                {unit.zip && <span>ZIP {unit.zip}</span>}
                {unit.recommended && (
                  <span style={{ background: GOLD, color: NAVY, padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                    Recommended
                  </span>
                )}
              </div>
            </div>

            {/* Main content area */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "55% 45%", padding: "24px 40px", gap: 24 }}>
              {/* Left — billboard photo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", background: NAVY_LIGHT, minHeight: 280, position: "relative" }}>
                  {unit.billboard_photo_url ? (
                    <img
                      src={unit.billboard_photo_url}
                      alt={`Unit ${unit.unit_number}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
                    />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: MUTED }}>
                      <ImageOff style={{ width: 40, height: 40, marginBottom: 8 }} />
                      <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>#{unit.unit_number}</span>
                    </div>
                  )}
                </div>

                {/* Highlights */}
                {(unit.highlights || (unit.insight_bullets && unit.insight_bullets.length > 0)) && (
                  <div style={{ borderLeft: `3px solid ${GOLD}`, padding: "10px 14px", background: NAVY_LIGHT, borderRadius: 8, fontSize: 13 }}>
                    {unit.insight_bullets && unit.insight_bullets.length > 0 ? (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {unit.insight_bullets.slice(0, 4).map((b, i) => (
                          <li key={i} style={{ display: "flex", gap: 8, marginBottom: 4, color: MUTED }}>
                            <Sparkles style={{ width: 12, height: 12, marginTop: 3, flexShrink: 0, color: GOLD }} />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: MUTED, margin: 0 }}>{unit.highlights}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Right — stats + map */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Stat pills */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <PrintStat label="Format" value={unit.format ?? "—"} />
                  <PrintStat label="Size" value={unit.size ?? "—"} />
                  <PrintStat label="4-Week Impressions" value={fmtNum(unit.four_week_impressions)} />
                  <PrintStat label="4-Week Rate" value={fmtMoney(unit.total_cost)} highlight />
                </div>

                {/* Additional costs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {unit.weekly_impressions != null && (
                    <PrintStat label="Weekly Impressions" value={fmtNum(unit.weekly_impressions)} />
                  )}
                  {unit.cpm != null && (
                    <PrintStat label="CPM" value={`$${unit.cpm.toFixed(2)}`} />
                  )}
                </div>

                <div style={{ fontSize: 12, color: MUTED }}>
                  {fmtCostLine("Production", unit.production_cost)} · {fmtCostLine("Install", unit.install_cost)}
                </div>

                {/* Inset map */}
                {unit.inset_map_url && (
                  <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", background: NAVY_LIGHT, minHeight: 180 }}>
                    <img
                      src={unit.inset_map_url}
                      alt={`Map for unit ${unit.unit_number}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 40px", display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, borderTop: `1px solid rgba(255,255,255,0.08)` }}>
              <span>coastalmaverick.com</span>
              <span>{campaign.client_name} · Unit {idx + 1} of {units.length}</span>
            </div>
          </section>
        ))}

        {/* ===== NEXT STEPS ===== */}
        <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 80px" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
            03 · Process
          </p>
          <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 40, fontWeight: 800, textTransform: "uppercase", marginBottom: 16 }}>
            Next Steps
          </h2>
          <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 48 }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32, maxWidth: 900, width: "100%" }}>
            {[
              { n: "01", title: "Review & Feedback", body: "Walk through the proposal and share questions." },
              { n: "02", title: "Final Approval", body: "Confirm the unit list and flight dates." },
              { n: "03", title: "Insertion Order", body: "Sign IOs and lock vendor inventory." },
              { n: "04", title: "Campaign Goes Live", body: "Creative installed, monitoring begins." },
            ].map((s) => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", border: `2px solid ${OCEAN}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18, fontWeight: 700, color: OCEAN }}>
                  {s.n}
                </div>
                <h3 style={{ marginTop: 16, fontFamily: "Montserrat, sans-serif", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: WHITE }}>
                  {s.title}
                </h3>
                <p style={{ marginTop: 8, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== MEET THE TEAM ===== */}
        <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 80px" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
            The Team
          </p>
          <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 40, fontWeight: 800, textTransform: "uppercase", marginBottom: 16 }}>
            Meet The Team
          </h2>
          <div style={{ height: 3, width: 64, background: GOLD, borderRadius: 2, marginBottom: 12 }} />
          <p style={{ fontSize: 15, color: MUTED, marginBottom: 48, maxWidth: 520, textAlign: "center", lineHeight: 1.6 }}>
            The people behind the placements — hands-on, collaborative, and committed to standout campaigns from start to finish.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, maxWidth: 800 }}>
            {team.map((m) => (
              <div key={m.name} style={{ textAlign: "center" }}>
                {m.photo && (
                  <div style={{ width: 160, height: 160, borderRadius: "50%", overflow: "hidden", margin: "0 auto", border: `4px solid ${NAVY_LIGHT}`, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                    <img
                      src={m.photo}
                      alt={`${m.name} — ${m.role}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ height: 3, width: 40, background: GOLD, borderRadius: 2, margin: "16px auto 0" }} />
                <h3 style={{ marginTop: 12, fontFamily: "Montserrat, sans-serif", fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: WHITE }}>
                  {m.name}
                </h3>
                <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: OCEAN, fontWeight: 600, marginTop: 4 }}>
                  {m.role}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== CLOSING CTA ===== */}
        <section className="print-section-page" style={{ background: NAVY, color: WHITE, minHeight: "100vh", display: "grid", gridTemplateColumns: "40% 60%" }}>
          {/* Navy branded panel */}
          <div style={{ background: NAVY_LIGHT, padding: "60px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Logo size={48} variant="onDark" />
            <p style={{ marginTop: 28, fontFamily: "Montserrat, sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.25em", color: WHITE }}>
              Coastal Maverick Media
            </p>
            <div style={{ height: 2, width: 48, background: GOLD, borderRadius: 2, marginTop: 16 }} />
            <blockquote style={{ marginTop: 28, fontStyle: "italic", fontSize: 17, color: GOLD, lineHeight: 1.6 }}>
              "Positioned where your audience moves."
            </blockquote>
          </div>

          {/* CTA panel */}
          <div style={{ padding: "60px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD, fontWeight: 600, marginBottom: 12 }}>
              For {campaign.client_name}
            </p>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 48, fontWeight: 800, textTransform: "uppercase", lineHeight: 0.95, color: WHITE }}>
              Let's Get<br />To Work.
            </h2>
            <div style={{ height: 3, width: 80, background: GOLD, borderRadius: 2, marginTop: 20 }} />

            <div style={{ marginTop: 36 }}>
              <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: WHITE }}>
                Heather Waisanen
              </p>
              <p style={{ fontSize: 13, color: MUTED }}>Founder & CEO</p>
            </div>

            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="mailto:heather.waisanen@gmail.com" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Mail className="h-4 w-4" /> heather.waisanen@gmail.com
              </a>
              <a href="https://www.instagram.com/coastalmaverick/" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Instagram className="h-4 w-4" /> @coastalmaverick
              </a>
              <a href="https://www.coastalmaverick.com/" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: OCEAN, textDecoration: "none" }}>
                <Globe className="h-4 w-4" /> coastalmaverick.com
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* =================== Print Stat Pill =================== */
function PrintStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? GOLD : NAVY_LIGHT,
      borderRadius: 10,
      padding: "12px 14px",
      border: highlight ? "none" : `1px solid rgba(255,255,255,0.08)`,
    }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, color: highlight ? NAVY : GOLD, marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 17, fontWeight: 700, color: highlight ? NAVY : WHITE, fontFamily: "Montserrat, sans-serif" }}>
        {value}
      </p>
    </div>
  );
}
