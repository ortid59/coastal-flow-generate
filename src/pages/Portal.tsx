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
  Building2,
  Mail,
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
import { PortalIndexBar } from "@/components/PortalIndexBar";
import { parseShortAddress } from "@/lib/shortAddress";
import { fmtCostLine } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Label as UILabel } from "@/components/ui/label";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
  proposal_name: string | null;
  client_logo_url: string | null;
  flight_start: string | null;
  flight_end: string | null;
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
  weekly_impressions: number | null;
  four_week_impressions: number | null;
  total_cost: number | null;
  production_cost: number | null;
  install_cost: number | null;
  four_week_periods: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | null) => (d ? format(new Date(d), "MMM d, yyyy") : "—");
const fmtDateShort = (d: string | null) => (d ? format(new Date(d), "M/d/yyyy") : "—");

export default function Portal({ token, campaignId }: { token: string; campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin/edit mode: when ?admin=1 is in the URL OR a Supabase session exists,
  // Heather sees extra controls (e.g., the investment-summary toggle).
  const [isAdminView, setIsAdminView] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  // Top scroll-progress bar
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.3 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      setIsAdminView(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setIsAdminView(true);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const [c, u] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, client_name, campaign_name, proposal_name, client_logo_url, flight_start, flight_end, markets")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("units")
          .select(
            "id, unit_number, market, vendor, format, size, location_description, insight_bullets, highlights, weekly_impressions, four_week_impressions, total_cost, production_cost, install_cost, four_week_periods, cpm, recommended, included, billboard_photo_url, latitude, longitude",
          )
          .eq("campaign_id", campaignId)
          .order("market", { ascending: true })
          .order("unit_number", { ascending: true }),
      ]);
      if (c.data) setCampaign(c.data as Campaign);
      // Only INCLUDED + RECOMMENDED units appear in the client presentation.
      setUnits(
        ((u.data ?? []) as Unit[]).filter(
          (x) => x.included !== false && x.recommended === true,
        ),
      );
      setLoading(false);
    })();
  }, [campaignId]);

  const stats = useMemo(() => {
    const imps = units.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = units.reduce((s, u) => s + (u.total_cost ?? 0), 0);
    const cpm = imps > 0 ? (cost / imps) * 1000 : null;
    return { units: units.length, imps, cost, cpm };
  }, [units]);

  const byMarket = useMemo(() => {
    const map = new Map<string, Unit[]>();
    units.forEach((u) => {
      const m = u.market ?? "Other";
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(u);
    });
    return Array.from(map.entries());
  }, [units]);


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

  const heroPhoto = units.find((u) => u.billboard_photo_url)?.billboard_photo_url ?? null;
  const flightLabel = `${fmtDateShort(campaign.flight_start)} – ${fmtDateShort(campaign.flight_end)}`;
  const primaryMarket = campaign.markets?.[0] ?? byMarket[0]?.[0] ?? "—";

  return (
    <div className="min-h-screen bg-background print:bg-white">
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
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* ===== SECTION 1 — COVER / HERO ===== */}
      <section className="relative bg-card">
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

              {/* Stat pills */}
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <CoverPill icon={<Calendar className="h-4 w-4" />} label="Campaign Dates" value={flightLabel} delay={0.7} />
                <CoverPill icon={<MapPin className="h-4 w-4" />} label="Market" value={primaryMarket} delay={0.78} />
                <CoverPill icon={<Sparkles className="h-4 w-4" />} label="Units" value={String(units.length)} delay={0.86} />
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
              <motion.img
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                src={heroPhoto}
                alt="Featured billboard"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <ImageOff className="h-14 w-14" />
              </div>
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

      {/* ===== HERO MAP ===== */}
      {mapPoints.length > 0 && (
        <section className="bg-card border-y print:hidden">
          <div className="container-app py-10 md:py-14">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="mb-6 flex items-end justify-between gap-4 flex-wrap"
            >
              <div>
                <div className="eyebrow">01 · Footprint</div>
                <h2 className="mt-2 font-heading text-2xl md:text-4xl font-bold uppercase tracking-tight text-foreground">
                  Where Your Brand Will Live
                </h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                {mapPoints.length} hand-picked placement{mapPoints.length === 1 ? "" : "s"}.
                Click a pin to jump to that unit.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <MasterMap
                points={mapPoints}
                onMarkerClick={handleMarkerClick}
                className="h-[480px] w-full shadow-elev-md border border-border"
              />
            </motion.div>
          </div>
        </section>
      )}

      {/* ===== UNIT INDEX BAR (sticky chips) ===== */}
      <PortalIndexBar units={units} />

      {/* ===== SECTION 2 — WHO WE ARE ===== */}
      <WhoWeAre />


      {/* ===== SECTION 3 — MARKET OVERVIEW ===== */}
      {byMarket.length > 0 && (
        <section className="bg-card">
          {/* Banner header */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-ocean text-[hsl(var(--ocean-foreground))]"
          >
            <div className="container-app py-10 md:py-14 text-center">
              <h2 className="font-heading text-3xl md:text-5xl font-bold uppercase tracking-tight">
                {primaryMarket} — Market Overview
              </h2>
              <p className="mt-3 text-sm md:text-base text-[hsl(var(--ocean-foreground))]/85 italic">
                Active Adults 25–45 · High-Traffic Corridors
              </p>
            </div>
          </motion.div>

          {/* Corridor cards */}
          <div className="container-app py-16 md:py-20">
            <div className="grid gap-6 md:grid-cols-3">
              {byMarket.slice(0, 3).map(([market, list], i) => {
                const corridorImps = list.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
                return (
                  <motion.div
                    key={market}
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ y: -6 }}
                    className="relative overflow-hidden rounded-2xl bg-card border border-border p-8 shadow-elev-sm transition-shadow hover:shadow-elev-md"
                  >
                    <span className="absolute top-0 left-0 right-0 h-[4px] bg-[hsl(var(--accent-gold))]" />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
                      Corridor {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-3 font-heading text-xl md:text-2xl font-bold uppercase tracking-tight text-foreground leading-tight">
                      {market}
                    </h3>
                    <CountUp
                      value={corridorImps}
                      className="mt-6 block num-display text-[hsl(var(--ocean))] leading-none"
                    />
                    <style>{``}</style>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      4-Week Impressions
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground">
                      {list.length} unit{list.length === 1 ? "" : "s"}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Date strip */}
          <div className="bg-secondary">
            <div className="container-app py-4 text-center text-sm font-medium text-foreground">
              {flightLabel}
            </div>
          </div>
        </section>
      )}

      {/* ===== SECTION 4 — RECOMMENDED PLACEMENTS ===== */}
      {byMarket.length > 0 && (
        <section className="bg-[hsl(var(--off-white))]">
          <div className="container-app py-20 md:py-28">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <div className="eyebrow">02 · Placements</div>
              <h2 className="mt-3 font-heading text-3xl md:text-5xl font-bold uppercase tracking-tight text-foreground">
                Recommended Placements
              </h2>
              <span className="mx-auto mt-5 gold-rule" />
              <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
                Hand-picked units across {byMarket.length} market
                {byMarket.length === 1 ? "" : "s"}, optimized for visibility and impact.
              </p>
            </motion.div>

            <div className="mt-16 space-y-20">
              {byMarket.map(([market, list], idx) => (
                <MarketSection key={market} market={market} units={list} index={idx} />
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

      {/* ===== SECTION 5 — INVESTMENT SUMMARY ===== */}
      {(showSummary || !isAdminView) && showSummary && (
        <section className="bg-card">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-primary text-primary-foreground"
          >
            <div className="container-app py-12 md:py-16 text-center">
              <h2 className="font-heading text-3xl md:text-5xl font-bold uppercase tracking-tight">
                Campaign Investment Summary
              </h2>
              <span className="mx-auto mt-5 block h-[3px] w-16 bg-[hsl(var(--accent-gold))] rounded-full" />
              <p className="mt-4 text-sm md:text-base text-primary-foreground/80">
                {primaryMarket} · {flightLabel}
              </p>
            </div>
          </motion.div>

          <div className="container-app py-16 md:py-20">
            {/* Admin-only toggle to hide the summary from clients */}
            {isAdminView && (
              <div className="mb-8 flex items-center justify-end gap-3 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-3">
                <UILabel htmlFor="show-summary" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Show Investment Summary (admin)
                </UILabel>
                <Switch id="show-summary" checked={showSummary} onCheckedChange={setShowSummary} />
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-3">
              <MetricCard
                label="Total 4-Week Impressions"
                value={<CountUp value={stats.imps} />}
                delay={0}
              />
              <MetricCard
                label="Total 4-Week Investment"
                value={
                  <CountUp
                    value={stats.cost}
                    format={(n) =>
                      new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(n)
                    }
                  />
                }
                delay={0.12}
              />
              <MetricCard
                label="Premium Placements"
                value={<CountUp value={stats.units} />}
                delay={0.24}
              />
            </div>

            {/* Per-unit line items */}
            <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-elev-sm">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border bg-secondary/40 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <span>Placement</span>
                <span className="text-right">Format</span>
                <span className="text-right">4-Week Rate</span>
              </div>
              {units.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border px-6 py-3.5 text-sm last:border-b-0 hover:bg-secondary/30"
                >
                  <span className="truncate text-foreground">
                    {parseShortAddress(u.location_description) || `Unit ${u.unit_number}`}
                  </span>
                  <span className="text-right text-muted-foreground">{u.format ?? "—"}</span>
                  <span className="text-right font-semibold tabular-nums text-foreground">
                    {fmtMoney(u.total_cost)}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-4 bg-secondary/60 px-6 py-4 text-sm">
                <span className="font-bold uppercase tracking-wider text-foreground">
                  Total 4-Week Investment
                </span>
                <span className="text-right font-heading text-lg font-bold tabular-nums text-[hsl(var(--ocean))]">
                  {fmtMoney(stats.cost)}
                </span>
              </div>
              {(() => {
                const periods = Math.max(
                  1,
                  ...units.map((u) => Number(u.four_week_periods ?? 0)).filter((n) => n > 0),
                  1,
                );
                if (periods <= 1) return null;
                return (
                  <div className="grid grid-cols-[1fr_auto] gap-4 bg-primary px-6 py-4 text-sm text-primary-foreground">
                    <span className="font-bold uppercase tracking-wider">
                      Total Campaign Investment ({periods} × 4-week periods)
                    </span>
                    <span className="text-right font-heading text-lg font-bold tabular-nums text-[hsl(var(--accent-gold))]">
                      {fmtMoney(stats.cost * periods)}
                    </span>
                  </div>
                );
              })()}
            </div>

            {stats.cpm != null && (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Blended CPM ·{" "}
                <span className="font-semibold text-foreground">${stats.cpm.toFixed(2)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Admin-only: when summary is hidden, show a slim restore bar */}
      {isAdminView && !showSummary && (
        <section className="bg-card border-y print:hidden">
          <div className="container-app flex items-center justify-end gap-3 py-4">
            <UILabel htmlFor="show-summary-restore" className="text-xs uppercase tracking-wider text-muted-foreground">
              Investment Summary hidden (admin) — show
            </UILabel>
            <Switch id="show-summary-restore" checked={showSummary} onCheckedChange={setShowSummary} />
          </div>
        </section>
      )}


      {/* ===== SECTION 6 — NEXT STEPS ===== */}
      <NextSteps />

      {/* ===== MEET THE TEAM ===== */}
      <MeetTheTeam />

      {/* ===== SECTION 7 — CLOSING / CTA ===== */}
      <ClosingCTA clientName={campaign.client_name} />

      {/* Footer */}
      <footer className="border-t bg-card py-8 text-center text-xs text-muted-foreground">
        Prepared by {brand.name} · Confidential — intended only for {campaign.client_name}.
      </footer>
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

/* =================== Next Steps =================== */
function NextSteps() {
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
            Next Steps
          </h2>
          <span className="mx-auto mt-5 gold-rule" />
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
            Coastal Maverick Media
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
              <Mail className="h-4 w-4" /> heather.waisanen@gmail.com
            </li>
            <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">
              <Instagram className="h-4 w-4" /> @coastalmaverick
            </li>
            <li className="flex items-center gap-2 text-[hsl(var(--ocean))] hover:underline">
              <Globe className="h-4 w-4" /> coastalmaverickmedia.com
            </li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

/* =================== Market Section (carousel) =================== */
function MarketSection({ market, units, index }: { market: string; units: Unit[]; index: number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [selected, setSelected] = useState(0);

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
              <UnitCard unit={u} indexLabel={String(i + 1).padStart(2, "0")} />
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
            <UnitDetails unit={current} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Print fallback */}
      <div className="hidden print:block space-y-6">
        {units.map((u, i) => (
          <div key={u.id}>
            <UnitCard unit={u} indexLabel={String(i + 1).padStart(2, "0")} />
            <div className="mt-4">
              <UnitDetails unit={u} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* =================== Unit Card (split layout per spec) =================== */
function UnitCard({ unit, indexLabel }: { unit: Unit; indexLabel: string }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-card border border-border shadow-elev-sm">
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
            <div className="inline-flex items-center rounded-full bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground))] px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-[0.18em]">
              Unit {indexLabel}
            </div>
            <span className="mt-5 gold-rule" />
            <h4 className="mt-5 font-heading text-2xl md:text-4xl font-bold uppercase tracking-tight leading-tight text-foreground">
              {parseShortAddress(unit.location_description) ||
                unit.format ||
                "Premium Placement"}
            </h4>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[hsl(var(--ocean))]">
              {unit.format ?? "Premium Placement"}
            </div>
            <div className="mt-3 font-mono text-sm text-muted-foreground">
              #{unit.unit_number}
            </div>
            {unit.highlights && (
              <p className="mt-4 text-sm md:text-base text-foreground leading-relaxed">
                {unit.highlights}
              </p>
            )}
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <div className="inline-flex items-center rounded-full bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground))] px-5 py-2 font-heading text-sm font-bold uppercase tracking-[0.12em]">
                4-Week Rate: {fmtMoney(unit.total_cost)}
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
                {(unit.size || unit.vendor) && (
                  <div className="pt-1">
                    {unit.size && <>Size: {unit.size}</>}
                    {unit.size && unit.vendor && <> · </>}
                    {unit.vendor && <>Vendor: {unit.vendor}</>}
                  </div>
                )}
              </div>
            </div>
            {unit.latitude != null && unit.longitude != null && (
              <UnitMinimap
                lat={Number(unit.latitude)}
                lng={Number(unit.longitude)}
                unitNumber={unit.unit_number}
              />
            )}
          </div>
        </motion.div>

        {/* Right panel */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-h-[300px] lg:min-h-[460px] bg-muted overflow-hidden"
        >
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
        </motion.div>
      </div>
    </article>
  );
}

/* =================== Unit Details =================== */
function UnitDetails({ unit }: { unit: Unit }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 rounded-2xl bg-card border border-border p-6 shadow-elev-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
          Quote details
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <DetailStat icon={<Eye className="h-4 w-4" />} label="4-Week Impressions" value={fmtNum(unit.four_week_impressions)} />
          <DetailStat icon={<DollarSign className="h-4 w-4" />} label="4-Week Investment" value={fmtMoney(unit.total_cost)} />
          <DetailStat
            icon={<TrendingUp className="h-4 w-4" />}
            label="CPM"
            value={unit.cpm == null ? "—" : `$${unit.cpm.toFixed(2)}`}
          />
          <DetailStat icon={<Ruler className="h-4 w-4" />} label="Size" value={unit.size ?? "—"} />
          <DetailStat icon={<Building2 className="h-4 w-4" />} label="Vendor" value={unit.vendor ?? "—"} />
          <DetailStat icon={<Sparkles className="h-4 w-4" />} label="Format" value={unit.format ?? "—"} />
        </div>
      </div>

      <div className="rounded-2xl bg-secondary border border-border border-t-[3px] border-t-[hsl(var(--accent-gold))] p-6 shadow-elev-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
          Why we recommend
        </div>
        {unit.insight_bullets && unit.insight_bullets.length > 0 ? (
          <ul className="mt-3 space-y-2.5 text-sm text-foreground">
            {unit.insight_bullets.slice(0, 5).map((b, i) => (
              <li key={i} className="flex gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-[hsl(var(--accent-gold))]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            High-visibility placement in {unit.market ?? "key market"}.
          </p>
        )}
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
