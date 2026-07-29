import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Printer,
  MapPin,
  Sparkles,
  ImageOff,
  Calendar,
  TrendingUp,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Eye,
  
  Mail,
  Phone,
  Globe,
  Instagram,
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import brand from "@/config/brand.json";
import { Logo } from "@/components/Logo";
import { MeetTheTeam } from "@/components/MeetTheTeam";
import { WhoWeAre } from "@/components/WhoWeAre";
import { CountUp } from "@/components/CountUp";
import { cleanHighlight } from "@/lib/cleanHighlight";
import { PortalIndexBar } from "@/components/PortalIndexBar";
import { parseShortAddress, displayAddress } from "@/lib/shortAddress";
import { fmtCostLine, flightRateLabel, flightRateValue, flightImpressionsLabel, flightImpressionsValue } from "@/lib/format";
import { exportNodesToPdf, exportNodeToPdf } from "@/lib/pdfExport";
import { useToast } from "@/hooks/use-toast";
import { useProposalSettings } from "@/hooks/useProposalSettings";


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
  // NOTE: `vendor` is intentionally NOT part of the client-facing Unit type.
  // It exists in the database but must never reach the portal — clients could
  // identify the media owner and bypass Coastal Maverick. Stripped at the data
  // fetch layer below (SELECT does not include it).
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
  production_cost: number | null;
  install_cost: number | null;
  four_week_periods: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
  inset_map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  geopath_id: string | null;
  media_type: string | null;
  facing: string | null;
  city: string | null;
  zip: string | null;
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
  // one day in US timezones (new Date("2026-08-31") is UTC midnight).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
};
const fmtDate = (d: string | null) => (d ? format(parseLocalDate(d), "MMM d, yyyy") : "—");
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

export default function Portal({ token, campaignId }: { token: string; campaignId: string }) {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'tier_a' | 'tier_b' | 'tier_c' | null>(null);
  const [expandedTier, setExpandedTier] = useState<'tier_a' | 'tier_b' | 'tier_c' | null>(null);
  const [heroIsLandscape, setHeroIsLandscape] = useState(false);

  // Top scroll-progress bar
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.3 });

  useEffect(() => {
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
            // VENDOR FIELD INTENTIONALLY EXCLUDED — see Unit type comment.
            "id, unit_number, market, format, size, location_description, address, insight_bullets, highlights, weekly_impressions, four_week_impressions, total_cost, negotiated_rate_4wk, production_cost, install_cost, four_week_periods, cpm, recommended, included, billboard_photo_url, inset_map_url, latitude, longitude, geopath_id, media_type, facing, city, zip, tier_a, tier_b, tier_c",
          )
          .eq("campaign_id", campaignId)
          .order("market", { ascending: true })
          .order("unit_number", { ascending: true }),
      ]);
      if (c.data) setCampaign(c.data as Campaign);
      // Only INCLUDED units appear in the client presentation.
      // The `recommended` flag controls whether the unit gets the "Recommended" ribbon,
      // not whether it appears at all.
      // Dedupe by unit_number — keep the first occurrence (rows are already sorted).
      const filtered = ((u.data ?? []) as Unit[]).filter(
        (x) => x.included !== false,
      );
      const seen = new Set<string>();
      const deduped: Unit[] = [];
      for (const unit of filtered) {
        const key = (unit.unit_number || "").trim().toLowerCase();
        if (!key) {
          deduped.push(unit);
          continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(unit);
      }
      setUnits(deduped);
      setLoading(false);
    })();
  }, [campaignId]);

  const stats = useMemo(() => {
    const marginMult = 1 + ((campaign?.margin_pct ?? 0) / 100);
    const imps = units.reduce((s, u) => s + flightImpressionsValue(u.four_week_impressions, u.four_week_periods), 0);
    const cost = units.reduce(
      (s, u) => s + (u.negotiated_rate_4wk ?? 0) * marginMult * (u.four_week_periods ?? 0),
      0,
    );
    const cpm = imps > 0 ? (cost / imps) * 1000 : null;
    return { units: units.length, imps, cost, cpm };
  }, [units, campaign?.margin_pct]);


  const byMarket = useMemo(() => {
    const map = new Map<string, Unit[]>();
    units.forEach((u) => {
      const m = u.market ?? "Other";
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(u);
    });
    return Array.from(map.entries());
  }, [units]);

  const displayedUnits = useMemo(() =>
    selectedTier
      ? units.filter((u) => u.included && u[selectedTier])
      : units.filter((u) => u.included),
    [units, selectedTier]
  );

  const displayedByMarket = useMemo(() => {
    const map = new Map<string, Unit[]>();
    displayedUnits.forEach((u) => {
      const m = u.market ?? "Other";
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(u);
    });
    return Array.from(map.entries());
  }, [displayedUnits]);

  const activeTiers = [
    campaign?.show_tier_a && { key: 'tier_a' as const, label: 'Option A', dateRange: fmtTierRange(campaign?.option_a_start ?? null, campaign?.option_a_end ?? null) },
    campaign?.show_tier_b && { key: 'tier_b' as const, label: 'Option B', dateRange: fmtTierRange(campaign?.option_b_start ?? null, campaign?.option_b_end ?? null) },
    campaign?.show_tier_c && { key: 'tier_c' as const, label: 'Option C', dateRange: fmtTierRange(campaign?.option_c_start ?? null, campaign?.option_c_end ?? null) },
  ].filter(Boolean) as { key: 'tier_a' | 'tier_b' | 'tier_c'; label: string; dateRange: string | null }[];

  const tierTotal = (key: 'tier_a' | 'tier_b' | 'tier_c') => {
    const marginMult = 1 + ((campaign?.margin_pct ?? 0) / 100);
    return units
      .filter((u) => u.included && u[key])
      .reduce(
        (sum, u) => sum + (u.negotiated_rate_4wk ?? 0) * marginMult * (u.four_week_periods ?? 0),
        0,
      );
  };



  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Proposal unavailable.</p>
      </div>
    );
  }

  // Hero photo priority: explicit campaign cover image > first unit photo
  const heroPhoto =
    campaign.cover_image_url ?? units.find((u) => u.billboard_photo_url)?.billboard_photo_url ?? null;
  const flightLabel = `${fmtDateShort(campaign.flight_start)} – ${fmtDateShort(campaign.flight_end)}`;
  const primaryMarket = campaign.markets?.[0] ?? byMarket[0]?.[0] ?? "—";

  return (
    <div className="min-h-screen bg-background print:bg-white overflow-x-hidden">
      {/* Scroll progress bar */}
      <motion.div
        style={{ scaleX: progress, transformOrigin: "0% 50%" }}
        className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-[hsl(var(--accent-gold))] print:hidden"
        aria-hidden
      />

      {/* Top bar — hidden on print */}
      <div className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur print:hidden">
        <div className="container-app flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="text-xs text-muted-foreground hidden sm:inline">Private proposal</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={units.length === 0 || !campaign}
            onClick={() => {
              if (!campaign) return;
              // Open the print-optimized proposal in a new tab; it auto-invokes
              // window.print() once images are ready. Same layout admin uses.
              window.open(`/proposal-print/${campaign.id}`, "_blank", "noopener");
            }}
          >
            <Printer className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* ===== SECTION 1 — COVER / HERO ===== */}
      <section data-pdf-page className="relative bg-card">
        <div className="grid lg:grid-cols-[55%_45%] min-h-[88vh]">
          {/* Left content */}
          <div className="relative flex items-center px-6 md:px-12 lg:px-16 py-16 md:py-24 border-l-[4px] border-[hsl(var(--accent-gold))]">
            <div className="max-w-xl">
              <motion.div
                initial={{ opacity: 0, x: -32 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="eyebrow"
              >
                Out-of-Home Proposal
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, x: -32 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 font-heading font-bold uppercase leading-[0.95] tracking-tight text-foreground"
                style={{ fontSize: "clamp(36px, 4.6vw, 64px)" }}
              >
                {campaign.proposal_name || campaign.campaign_name}
              </motion.h1>

              <motion.span
                initial={{ width: 0 }}
                animate={{ width: 64 }}
                transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="mt-5 block h-[3px] bg-[hsl(var(--accent-gold))] rounded-full"
              />

              <motion.p
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.55 }}
                className="mt-6 text-base md:text-lg text-muted-foreground"
              >
                Prepared for{" "}
                <span className="font-semibold text-foreground">{campaign.client_name}</span>
              </motion.p>

              {/* Stat pills — Units pill removed per spec; keep dates + market */}
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <CoverPill icon={<Calendar className="h-4 w-4" />} label="Campaign Dates" value={flightLabel} delay={0.7} />
                <CoverPill icon={<MapPin className="h-4 w-4" />} label="Market" value={primaryMarket} delay={0.78} />
              </div>

              {/* Logo & tagline */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 1.0 }}
                className="mt-12 flex items-center gap-3"
              >
                <Logo size={36} />
                <div>
                  <div className="font-heading text-sm font-bold uppercase tracking-wider text-foreground">
                    {brand.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground italic">
                    Positioned where your audience moves.
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Right photo */}
          <div className="relative bg-[hsl(var(--off-white))] min-h-[40vh] lg:min-h-full overflow-hidden">
            {heroPhoto ? (
              <>
                {/* Blurred fill background — visible only when the uploaded
                 *  image is landscape (width > height) so we don't crop it.
                 *  Portrait images fill via object-cover and hide this layer. */}
                <img
                  src={heroPhoto}
                  alt=""
                  aria-hidden
                  className={`absolute inset-0 h-full w-full object-cover scale-125 blur-2xl opacity-70 transition-opacity ${heroIsLandscape ? "" : "hidden"}`}
                />
                <motion.img
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                  src={heroPhoto}
                  alt="Featured billboard"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setHeroIsLandscape(img.naturalWidth > img.naturalHeight);
                  }}
                  className={`absolute inset-0 h-full w-full ${heroIsLandscape ? "object-contain" : "object-cover"}`}
                  style={{ objectPosition: "center" }}
                />
              </>
            ) : (
              <div
                className="absolute inset-0"
                aria-hidden
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--ocean)) 100%)",
                }}
              />
            )}
            <div
              className="absolute inset-0"
              aria-hidden
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary) / 0.30) 0%, transparent 60%)",
              }}
            />
            {campaign.client_logo_url && (
              <motion.img
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                src={campaign.client_logo_url}
                alt={`${campaign.client_name} logo`}
                className="absolute top-6 right-6 h-14 w-auto rounded-md bg-card/95 p-2 shadow-elev-md"
              />
            )}
          </div>
        </div>
      </section>

      {/* ===== SECTION 2 — WHO WE ARE ===== */}
      <div data-pdf-page><WhoWeAre /></div>


      {/* ===== SECTION 3 — RECOMMENDED PLACEMENTS ===== */}
      {byMarket.length > 0 && (
        <section className="bg-[hsl(var(--off-white))]">
          <div className="container-app py-20 md:py-28">

            {/* Campaign Coverage Map */}
            {campaign?.vendor_overview_map_url && (
              <div data-pdf-page className="mb-10 mt-16">
                <div className="text-center mb-8">
                  <div className="eyebrow">Coverage</div>
                  <h2 className="mt-3 font-heading text-2xl md:text-3xl font-bold uppercase tracking-tight text-foreground">
                    Campaign Coverage Map
                  </h2>
                  <span className="mx-auto mt-5 gold-rule" />
                </div>
                <div className="overflow-hidden rounded-xl border border-border/40 shadow-elev-sm">
                  <img
                    src={campaign.vendor_overview_map_url}
                    alt="Campaign coverage map"
                    className="w-full h-auto object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* Campaign Options */}
            {activeTiers.length >= 2 && (
              <div className="mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">
                  Choose Your Option
                </p>
                <div className={`grid gap-4 ${activeTiers.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                  {activeTiers.map((tier) => {
                    const tierUnits = units.filter((u) => u.included && u[tier.key]);
                    const marginMult = 1 + ((campaign.margin_pct ?? 0) / 100);
                    const fourWeekRate = tierUnits.reduce((sum, u) => sum + (u.negotiated_rate_4wk ?? 0) * marginMult, 0);
                    const totalImpressions = tierUnits.reduce((sum, u) => sum + (u.four_week_impressions ?? 0), 0);
                    const totalPeriods = tierUnits.reduce((sum, u) => sum + (u.four_week_periods ?? 0), 0);
                    const totalCampaignCost = tierUnits.reduce(
                      (sum, u) => sum + (u.negotiated_rate_4wk ?? 0) * marginMult * (u.four_week_periods ?? 0),
                      0,
                    );
                    const isSelected = selectedTier === tier.key;
                    const isExpanded = expandedTier === tier.key;
                    const visibleUnits = isExpanded ? tierUnits : tierUnits.slice(0, 4);
                    const hiddenCount = tierUnits.length - 4;

                    return (
                      <button
                        key={tier.key}
                        onClick={() => setSelectedTier(isSelected ? null : tier.key)}
                        className={`relative text-left rounded-xl border-2 p-6 flex flex-col gap-4 transition-all duration-200 w-full ${
                          isSelected
                            ? 'border-[hsl(var(--accent-gold))] bg-[hsl(var(--accent-gold)/0.06)] shadow-md'
                            : 'border-border/40 bg-card hover:border-border hover:shadow-sm'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute -top-3 left-5 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[hsl(var(--accent-gold))] text-white">
                            Selected
                          </span>
                        )}

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                            {tier.label}
                          </p>
                          {tier.dateRange && (
                            <p className="text-xs text-foreground/70 font-medium">{tier.dateRange}</p>
                          )}
                        </div>

                        <div className="border-t border-border/30 pt-4 flex flex-col gap-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Placements</span>
                            <span className="font-semibold">{tierUnits.length} units</span>
                          </div>
                          {fourWeekRate > 0 ? (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Four-Week Rate</span>
                              <span className="font-semibold">${fourWeekRate.toLocaleString()}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Four-Week Rate</span>
                              <span className="font-semibold italic text-muted-foreground">Contact for pricing</span>
                            </div>
                          )}
                          {totalImpressions > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Four-Week Impressions</span>
                              <span className="font-semibold">{totalImpressions.toLocaleString()}</span>
                            </div>
                          )}
                          {totalCampaignCost > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Total Campaign Cost</span>
                              <span className="font-semibold">
                                {totalPeriods > 0 && (
                                  <span className="text-muted-foreground font-normal">
                                    {fmtPeriods(totalPeriods)} ·{' '}
                                  </span>
                                )}
                                ${totalCampaignCost.toLocaleString()} total
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-border/30 pt-4">
                          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-semibold">
                            Includes
                          </p>
                          <ul className="space-y-1">
                            {visibleUnits.map((u) => (
                              <li key={u.id} className="text-xs text-foreground/80 truncate">
                                • {displayAddress(u) || u.location_description || u.unit_number}
                              </li>
                            ))}
                          </ul>
                          {hiddenCount > 0 && !isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedTier(tier.key);
                              }}
                              className="mt-2 text-xs font-semibold text-[hsl(var(--accent-gold))] hover:underline"
                            >
                              + {hiddenCount} more locations
                            </button>
                          )}
                          {isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedTier(null);
                              }}
                              className="mt-2 text-xs font-semibold text-muted-foreground hover:underline"
                            >
                              Show less
                            </button>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedTier
                        ? `Showing ${activeTiers.find(t => t.key === selectedTier)?.label} — ${displayedUnits.length} units`
                        : `Showing all ${displayedUnits.length} units`}
                    </p>
                    {selectedTier && (() => {
                      const total = tierTotal(selectedTier);
                      return total > 0 ? (
                        <p className="text-sm font-semibold text-foreground mt-1">
                          Estimated investment: {fmtMoney(total)} for {displayedUnits.length} location{displayedUnits.length === 1 ? '' : 's'}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  {selectedTier && (
                    <button
                      onClick={() => setSelectedTier(null)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
                    >
                      Clear selection — view all
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className={`${campaign?.vendor_overview_map_url || activeTiers.length >= 2 ? '' : 'mt-16'} space-y-20`}>
              {displayedByMarket.map(([market, list], idx) => (
                <MarketSection key={`${market}-${selectedTier ?? 'all'}`} market={market} units={list} index={idx} campaign={campaign} activeTiers={activeTiers} selectedTier={selectedTier} />
              ))}
            </div>
          </div>
        </section>
      )}

      {byMarket.length === 0 && (
        <section className="container-app py-20 text-center">
          <p className="text-muted-foreground">No recommended units selected yet.</p>
        </section>
      )}

      {/* ===== PROPOSAL INDEX ===== */}
      <PortalIndexBar units={units} marginMult={1 + ((campaign?.margin_pct ?? 0) / 100)} />

      {/* ===== NEXT STEPS ===== */}
      <div data-pdf-page><NextSteps /></div>

      {/* ===== MEET THE TEAM ===== */}
      <div data-pdf-page><MeetTheTeam /></div>


      {/* ===== CLOSING / CTA ===== */}
      <ClosingCTA clientName={campaign.client_name} />

      {/* Footer */}
      <PortalFooter clientName={campaign.client_name} />

    </div>
  );
}

/* =================== Cover Pill =================== */
function CoverPill({
  icon,
  label,
  value,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={{ y: -2 }}
      className="rounded-2xl bg-secondary border border-border p-4 shadow-elev-sm transition-shadow hover:shadow-elev-md"
    >
      <div className="flex items-center gap-1.5 text-[hsl(var(--ocean))]">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--accent-gold))]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 font-heading text-base font-bold text-foreground leading-tight">
        {value}
      </div>
    </motion.div>
  );
}

/* =================== Metric Card =================== */
function MetricCard({
  label,
  value,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className="relative overflow-hidden rounded-2xl bg-secondary p-10 md:p-12 text-center shadow-elev-sm transition-shadow hover:shadow-elev-md"
    >
      <span className="absolute top-0 left-0 right-0 h-[4px] bg-[hsl(var(--accent-gold))]" />
      <div
        className="num-display text-[hsl(var(--ocean))] leading-none"
        style={{ fontSize: "clamp(48px, 6vw, 80px)" }}
      >
        {value}
      </div>
      <span className="mx-auto mt-5 block h-[2px] w-12 bg-[hsl(var(--accent-gold))] rounded-full" />
      <div className="mt-4 font-heading text-sm font-bold uppercase tracking-[0.18em] text-foreground">
        {label}
      </div>
    </motion.div>
  );
}

/* =================== Portal Footer =================== */
function PortalFooter({ clientName }: { clientName: string }) {
  const s = useProposalSettings();
  const name = s.company_name || brand.name;
  return (
    <footer className="border-t bg-card py-8 text-center text-xs text-muted-foreground space-y-1">
      <div>Prepared by {name} · Confidential — intended only for {clientName}.</div>
      {s.footer_tagline && <div className="whitespace-pre-line">{s.footer_tagline}</div>}
    </footer>
  );
}

/* =================== Next Steps =================== */
function NextSteps() {
  const s = useProposalSettings();

  const steps = [
    { n: "01", title: "Review & Feedback", body: "Walk through the proposal and share questions." },
    { n: "02", title: "Final Approval", body: "Confirm the unit list and flight dates." },
    { n: "03", title: "Insertion Order", body: "Sign IOs and lock vendor inventory." },
    { n: "04", title: "Campaign Goes Live", body: "Creative installed, monitoring begins." },
  ];

  return (
    <section className="bg-[hsl(var(--off-white))]">
      <div className="container-app py-20 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="eyebrow">03 · Process</div>
          <h2 className="mt-3 font-heading text-3xl md:text-5xl font-bold uppercase tracking-tight text-foreground">
            {s.next_steps_heading || "Next Steps"}
          </h2>
          <span className="mx-auto mt-5 gold-rule" />
          {s.next_steps_body && (
            <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg text-muted-foreground whitespace-pre-line">
              {s.next_steps_body}
            </p>
          )}

        </motion.div>

        <div className="mt-16 grid gap-8 md:grid-cols-4 relative">
          {/* Connector line (md+) */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "0% 50%" }}
            className="hidden md:block absolute top-7 left-[12%] right-[12%] h-[2px] bg-gradient-gold"
            aria-hidden
          />

          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="relative text-center"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary border-2 border-[hsl(var(--ocean))] font-heading text-lg font-bold text-[hsl(var(--ocean))] transition-all duration-300 hover:bg-[hsl(var(--ocean))] hover:text-[hsl(var(--ocean-foreground))] hover:scale-110 cursor-default">
                {s.n}
              </div>
              <h3 className="mt-5 font-heading text-base font-bold uppercase tracking-wide text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================== Closing CTA =================== */
function ClosingCTA({ clientName }: { clientName: string }) {
  const s = useProposalSettings();
  const email = s.company_email || "heather.waisanen@gmail.com";
  return (
    <section className="bg-card">
      <div className="grid lg:grid-cols-[40%_60%]">
        {/* Navy panel */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="bg-primary text-primary-foreground p-10 md:p-16 flex flex-col justify-center"
        >
          <Logo size={48} variant="onDark" className="self-start" />
          <div className="mt-8 font-heading text-sm font-bold uppercase tracking-[0.25em]">
            {s.company_name || "Coastal Maverick"}
          </div>
          <span className="mt-4 block h-[2px] w-12 bg-[hsl(var(--accent-gold))] rounded-full" />
          <blockquote className="mt-8 font-body italic text-base md:text-lg text-[hsl(var(--accent-gold))] leading-relaxed">
            "Positioned where your audience moves."
          </blockquote>
        </motion.div>

        {/* White panel */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="p-10 md:p-16 flex flex-col justify-center"
        >
          <div className="eyebrow">For {clientName}</div>
          <h2 className="mt-3 font-heading font-bold uppercase tracking-tight text-foreground leading-[0.95]"
              style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}>
            Let's Get<br />To Work.
          </h2>
          <span className="mt-5 block h-[3px] w-20 bg-[hsl(var(--accent-gold))] rounded-full" />

          <div className="mt-10">
            <div className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
              Heather Waisanen
            </div>
            <div className="text-sm text-muted-foreground">Founder & CEO</div>
          </div>

          <ul className="mt-6 space-y-2 text-sm">
            <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${email}`}>{email}</a>
            </li>
            {s.company_phone && (
              <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">
                <Phone className="h-4 w-4" />
                <a href={`tel:${s.company_phone.replace(/[^0-9+]/g, "")}`}>{s.company_phone}</a>
              </li>
            )}
            <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">

              <Instagram className="h-4 w-4" />
              <a href="https://www.instagram.com/coastalmaverick/" target="_blank" rel="noreferrer">
                @coastalmaverick
              </a>
            </li>
            <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">
              <Globe className="h-4 w-4" />
              <a href="https://www.coastalmaverick.com/" target="_blank" rel="noreferrer">
                coastalmaverick.com
              </a>
            </li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

/* =================== Market Section (carousel) =================== */
function MarketSection({ market, units, index, campaign, activeTiers, selectedTier }: { market: string; units: Unit[]; index: number; campaign: Campaign | null; activeTiers: { key: 'tier_a' | 'tier_b' | 'tier_c'; label: string }[]; selectedTier?: 'tier_a' | 'tier_b' | 'tier_c' | null }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [selected, setSelected] = useState(0);

  // Reset carousel index when tier filter changes
  useEffect(() => {
    setSelected(0);
    emblaApi?.scrollTo(0);
  }, [selectedTier, emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  // Listen for "focus this unit" events from the hero map.
  useEffect(() => {
    if (!emblaApi) return;
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const idx = units.findIndex((u) => u.id === id);
      if (idx >= 0) emblaApi.scrollTo(idx);
    };
    window.addEventListener("cm:focus-unit", onFocus);
    return () => window.removeEventListener("cm:focus-unit", onFocus);
  }, [emblaApi, units]);

  const current = units[selected] ?? units[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mb-8 flex items-end justify-between gap-4 print:hidden">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-[hsl(var(--ocean))]">
            Market {String(index + 1).padStart(2, "0")}
          </div>
          <h3 className="mt-2 font-heading text-2xl md:text-4xl font-bold uppercase tracking-tight flex items-center gap-2 text-foreground">
            <MapPin className="h-6 w-6 text-[hsl(var(--accent-gold))]" />
            {market}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground hidden sm:inline">
            {units.length} unit{units.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => emblaApi?.scrollPrev()}
            className="rounded-full border bg-card p-2 text-foreground shadow-elev-sm transition hover:bg-secondary disabled:opacity-40"
            aria-label="Previous unit"
            disabled={units.length <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            className="rounded-full border bg-card p-2 text-foreground shadow-elev-sm transition hover:bg-secondary disabled:opacity-40"
            aria-label="Next unit"
            disabled={units.length <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Carousel — screen only */}
      <div className="overflow-hidden rounded-2xl print:hidden" ref={emblaRef}>
        <div className="flex">
          {units.map((u, i) => (
            <div key={u.id} id={`unit-${u.id}`} className="min-w-0 flex-[0_0_100%] pr-4 scroll-mt-24">
              <UnitCard unit={u} indexLabel={String(i + 1).padStart(2, "0")} activeTiers={activeTiers} marginMult={1 + ((campaign?.margin_pct ?? 0) / 100)} />
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      {units.length > 1 && (
        <div className="mt-5 flex justify-center gap-2 print:hidden">
          {units.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === selected
                  ? "w-8 bg-[hsl(var(--accent-gold))]"
                  : "w-2 bg-border hover:bg-muted-foreground/40"
              }`}
              aria-label={`Go to unit ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Detail panel for selected unit */}
      <div className="mt-6 print:hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <UnitDetails unit={current} marginMult={1 + ((campaign?.margin_pct ?? 0) / 100)} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/*
        PDF source — always rendered (off-screen) so html2canvas can read each
        quote node from the DOM. Hidden from users via absolute + clip rect.
      */}
      <div
        aria-hidden
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: "-10000px",
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ width: "780px" }}>
          {units.map((u, i) => (
            <div
              key={u.id}
              id={`pdf-quote-${u.id}`}
              data-pdf-page
              className="bg-white"
              style={{ width: "780px", padding: "16px" }}
            >

              <PrintableQuote
                unit={u}
                market={market}
                campaign={campaign}
                indexLabel={`${String(index + 1).padStart(2, "0")}.${String(i + 1).padStart(2, "0")}`}
              />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* =================== Unit Card (split layout per spec) =================== */
function UnitCard({ unit, indexLabel, activeTiers, marginMult }: { unit: Unit; indexLabel: string; activeTiers: { key: 'tier_a' | 'tier_b' | 'tier_c'; label: string }[]; marginMult: number }) {
  const { toast } = useToast();

  return (
    <article className="overflow-hidden rounded-xl bg-card border border-border/30 shadow-elev-sm">
      <div className="grid lg:grid-cols-[45%_55%]">
        {/* Left panel */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="p-8 md:p-10 flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground))] px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-[0.18em]">
                Unit {indexLabel}
              </div>
              {unit.recommended && (
                <div className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--ocean))] text-[hsl(var(--ocean-foreground))] px-3 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.18em] shadow-elev-sm">
                  <Sparkles className="h-3 w-3" /> Recommended
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  const targetWindow = window.top !== window.self ? window.open("", "_blank") : null;
                  try {
                    await downloadSingleQuotePdf(unit.id, unit.unit_number, targetWindow);
                    toast({ title: "PDF downloaded" });
                  } catch (e: any) {
                    if (targetWindow && !targetWindow.closed) targetWindow.close();
                    toast({
                      title: "PDF export failed",
                      description: e?.message ?? "PDF generation failed, please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition hover:bg-secondary hover:text-foreground print:hidden"
                title="Download this quote as PDF"
              >
                <Printer className="h-3 w-3" /> PDF
              </button>
            </div>
            {activeTiers.length >= 2 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {activeTiers.filter((t) => unit[t.key]).map((t) => (
                  <span
                    key={t.key}
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[hsl(var(--accent-gold)/0.12)] text-[hsl(var(--accent-gold))] border border-[hsl(var(--accent-gold)/0.3)]"
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            )}
            <span className="mt-5 gold-rule" />
            <h4 className="mt-5 font-heading text-2xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
              {displayAddress(unit) ||
                unit.format ||
                "Premium Placement"}
            </h4>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--ocean))]">
              {unit.format ?? "Premium Placement"}
            </div>
            <div className="mt-3 font-mono text-sm text-muted-foreground">
              #{unit.unit_number}
            </div>
            {cleanHighlight(unit.highlights) && (
              <p className="mt-4 text-sm md:text-base text-foreground leading-relaxed">
                {cleanHighlight(unit.highlights)}
              </p>
            )}

            {/* Map image extracted from photosheet */}
            {unit.inset_map_url && (
              <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/30">
                <img
                  src={unit.inset_map_url}
                  alt={`Location map for unit ${unit.unit_number}`}
                  className="w-full h-auto object-contain"
                  loading="lazy"
                  onError={(e) => {
                    const container = (e.target as HTMLElement).parentElement;
                    if (container) container.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <div className="inline-flex items-center rounded-full bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground))] px-5 py-2 font-heading text-sm font-bold uppercase tracking-[0.12em]">
                {flightRateLabel(unit.four_week_periods)}: {fmtMoney(flightRateValue(unit.negotiated_rate_4wk, marginMult, unit.four_week_periods))}
              </div>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {unit.weekly_impressions != null && (
                  <div>
                    <span className="font-semibold text-foreground">Weekly Impressions:</span>{" "}
                    {fmtNum(unit.weekly_impressions)}
                  </div>
                )}
                {unit.four_week_impressions != null && (
                  <div>
                    <span className="font-semibold text-foreground">4-Week Impressions:</span>{" "}
                    {fmtNum(unit.four_week_impressions)}
                  </div>
                )}
                <div>{fmtCostLine("Production", unit.production_cost)}</div>
                <div>{fmtCostLine("Install", unit.install_cost)}</div>
                {unit.size && (
                  <div className="pt-1">Size: {unit.size}</div>
                )}
              </div>
            </div>
          </div>

        </motion.div>

        {/* Right panel — billboard photo + description details */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Billboard photo container */}
          <div className="relative h-[320px] lg:h-[460px] max-h-[460px] bg-muted overflow-hidden border-2 border-border/40 flex-shrink-0">
            {unit.billboard_photo_url ? (
              <img
                src={unit.billboard_photo_url}
                alt={`Unit ${unit.unit_number}`}
                className="absolute inset-0 h-full w-full object-cover animate-[float_8s_ease-in-out_infinite]"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <ImageOff className="h-10 w-10" />
              </div>
            )}
            <div
              className="absolute inset-0"
              aria-hidden
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary) / 0.22) 0%, transparent 55%)",
              }}
            />
            {unit.four_week_impressions != null && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                className="absolute bottom-6 left-6 rounded-xl bg-card/95 backdrop-blur border-l-[4px] border-[hsl(var(--accent-gold))] px-6 py-4 shadow-elev-md"
              >
                <CountUp
                  value={unit.four_week_impressions}
                  className="block num-display text-3xl md:text-4xl text-foreground leading-none"
                />
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
                  4-Week Impressions
                </div>
              </motion.div>
            )}
          </div>

          {/* Description details block */}
          {(unit.location_description ||
            unit.geopath_id ||
            unit.media_type ||
            unit.facing ||
            unit.size ||
            unit.city ||
            unit.zip ||
            (unit.latitude != null && unit.longitude != null)) && (
            <dl className="m-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border bg-secondary/40 p-4 text-[11px]">
              {unit.location_description && (
                <div className="col-span-2">
                  <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Description</dt>
                  <dd className="mt-0.5 text-foreground">{unit.location_description}</dd>
                </div>
              )}
              {unit.geopath_id && (
                <DetailKV label="Geopath ID" value={unit.geopath_id} />
              )}
              {unit.media_type && (
                <DetailKV label="Media Type" value={unit.media_type} />
              )}
              {unit.facing && <DetailKV label="Facing" value={unit.facing} />}
              {unit.size && <DetailKV label="Size" value={unit.size} />}
              {unit.city && <DetailKV label="City" value={unit.city} />}
              {unit.zip && <DetailKV label="Zip" value={unit.zip} />}
              {unit.latitude != null && (
                <DetailKV label="Latitude" value={unit.latitude.toFixed(5)} />
              )}
              {unit.longitude != null && (
                <DetailKV label="Longitude" value={unit.longitude.toFixed(5)} />
              )}
            </dl>
          )}
        </motion.div>
      </div>
    </article>
  );
}

/* =================== Unit Details =================== */
function UnitDetails({ unit, marginMult }: { unit: Unit; marginMult: number }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-card border border-border p-6 shadow-elev-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
          Quote details
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <DetailStat icon={<Eye className="h-4 w-4" />} label="4-Week Impressions" value={fmtNum(unit.four_week_impressions)} />
          <DetailStat icon={<DollarSign className="h-4 w-4" />} label={flightRateLabel(unit.four_week_periods)} value={fmtMoney(flightRateValue(unit.negotiated_rate_4wk, marginMult, unit.four_week_periods))} />
          <DetailStat
            icon={<TrendingUp className="h-4 w-4" />}

            label="CPM"
            value={unit.cpm == null ? "—" : `$${unit.cpm.toFixed(2)}`}
          />
          <DetailStat icon={<Ruler className="h-4 w-4" />} label="Size" value={unit.size ?? "—"} />
          <DetailStat icon={<Sparkles className="h-4 w-4" />} label="Format" value={unit.format ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-heading text-lg font-bold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DetailKV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-foreground">{value}</dd>
    </div>
  );
}

/* =================== Print helpers =================== */

/**
 * Download a single quote as a PDF using the off-screen PrintableQuote node.
 */
async function downloadSingleQuotePdf(unitId: string, unitNumber: string, targetWindow?: Window | null) {
  const node = document.getElementById(`pdf-quote-${unitId}`);
  if (!node) {
    if (targetWindow && !targetWindow.closed) targetWindow.close();
    console.warn("No PDF node for unit", unitId);
    return;
  }
  await exportNodeToPdf(node, `quote-${unitNumber || unitId}.pdf`, targetWindow);
}

/* =================== Printable Quote (PDF layout) =================== */
/**
 * Self-contained, all-explicit-color print layout. Avoids any Tailwind theme
 * tokens (text-muted-foreground, bg-secondary, etc.) so html2canvas always
 * paints crisp black/grey on white regardless of the current site theme.
 */
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
  const NAVY = "#0F2A44";
  const GOLD = "#C9A24A";
  const GREY = "#6B7280";
  const BORDER = "#E5E7EB";
  const SOFT = "#F8FAFC";

  return (
    <article
      data-print-quote-id={unit.id}
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
          borderBottom: `3px solid ${GOLD}`,
          paddingBottom: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.25em", color: NAVY, fontWeight: 700 }}>
            COASTAL MAVERICK · {market.toUpperCase()}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginTop: 2 }}>
            {campaign?.proposal_name || campaign?.campaign_name || "Proposal"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: GREY }}>QUOTE</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, lineHeight: 1 }}>
            {indexLabel}
          </div>
        </div>
      </div>

      {/* Title row */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: GREY, fontWeight: 600 }}>
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
          <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{unit.location_description}</div>
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
        <PhotoBox label="Location photo" src={unit.billboard_photo_url} border={BORDER} grey={GREY} />
        {unit.inset_map_url && (
          <PhotoBox label="Location map" src={unit.inset_map_url} border={BORDER} grey={GREY} />
        )}
      </div>


      {/* Highlights */}
      {cleanHighlight(unit.highlights) && (
        <div
          style={{
            background: SOFT,
            borderLeft: `3px solid ${GOLD}`,
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
        <DetailBlock title="Quote details" navy={NAVY} border={BORDER} soft={SOFT}>
          {unit.geopath_id && <Row k="Geopath ID" v={unit.geopath_id} grey={GREY} />}
          {unit.media_type && <Row k="Media Type" v={unit.media_type} grey={GREY} />}
          {unit.facing && <Row k="Facing" v={unit.facing} grey={GREY} />}
          {unit.size && <Row k="Size" v={unit.size} grey={GREY} />}
          {unit.city && <Row k="City" v={unit.city} grey={GREY} />}
          {unit.zip && <Row k="Zip" v={unit.zip} grey={GREY} />}
          {unit.latitude != null && (
            <Row k="Latitude" v={unit.latitude.toFixed(5)} grey={GREY} />
          )}
          {unit.longitude != null && (
            <Row k="Longitude" v={unit.longitude.toFixed(5)} grey={GREY} />
          )}
        </DetailBlock>

        <DetailBlock title="Performance & Investment" navy={NAVY} border={BORDER} soft={SOFT}>
          {unit.weekly_impressions != null && (
            <Row k="Weekly Impressions" v={fmtNum(unit.weekly_impressions)} grey={GREY} />
          )}
          {unit.four_week_impressions != null && (
            <Row k="4-Week Impressions" v={fmtNum(unit.four_week_impressions)} grey={GREY} />
          )}
          {unit.cpm != null && <Row k="CPM" v={`$${unit.cpm.toFixed(2)}`} grey={GREY} />}
          <div style={{ borderTop: `1px solid ${BORDER}`, margin: "6px 0" }} />
          {unit.production_cost != null && (
            <Row k="Production" v={fmtMoney(unit.production_cost)} grey={GREY} />
          )}
          {unit.install_cost != null && (
            <Row k="Install" v={fmtMoney(unit.install_cost)} grey={GREY} />
          )}
          <Row k={flightRateLabel(unit.four_week_periods)} v={fmtMoney(flightRateValue(unit.negotiated_rate_4wk, 1 + ((campaign?.margin_pct ?? 0) / 100), unit.four_week_periods))} grey={GREY} bold />

        </DetailBlock>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 8,
          borderTop: `1px solid ${BORDER}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: GREY,
          letterSpacing: "0.05em",
        }}
      >
        <span>coastalmaverick.com</span>
        <span>{campaign?.client_name ?? ""}</span>
      </div>
    </article>
  );
}

function PhotoBox({
  src,
  label,
  border,
  grey,
}: {
  src: string | null;
  label: string;
  border: string;
  grey: string;
}) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 6, overflow: "hidden", background: "#F3F4F6" }}>
      {src ? (
        <img
          src={src}
          alt={label}
          crossOrigin="anonymous"
          style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: grey,
            fontSize: 11,
          }}
        >
          No image available
        </div>
      )}
      <div
        style={{
          padding: "4px 8px",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: grey,
          fontWeight: 600,
          textTransform: "uppercase",
          background: "#fff",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  children,
  navy,
  border,
  soft,
}: {
  title: string;
  children: React.ReactNode;
  navy: string;
  border: string;
  soft: string;
}) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 6, background: soft, padding: 10 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: navy,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: `1px solid ${border}`,
        }}
      >
        {title}
      </div>
      <dl style={{ margin: 0 }}>{children}</dl>
    </div>
  );
}

function Row({
  k,
  v,
  bold,
  grey,
}: {
  k: string;
  v: string;
  bold?: boolean;
  grey: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "3px 0",
        fontSize: 10.5,
      }}
    >
      <dt style={{ color: grey, margin: 0 }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          color: "#111827",
          fontWeight: bold ? 700 : 500,
          textAlign: "right",
        }}
      >
        {v}
      </dd>
    </div>
  );
}

