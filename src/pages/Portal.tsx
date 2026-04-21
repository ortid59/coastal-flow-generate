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
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import brand from "@/config/brand.json";
import { Logo } from "@/components/Logo";
import { MeetTheTeam } from "@/components/MeetTheTeam";
import { WhoWeAre } from "@/components/WhoWeAre";

type Campaign = {
  id: string;
  client_name: string;
  campaign_name: string;
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
  four_week_impressions: number | null;
  total_cost: number | null;
  cpm: number | null;
  recommended: boolean | null;
  included: boolean | null;
  billboard_photo_url: string | null;
};

const fmtNum = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | null) => (d ? format(new Date(d), "MMM d, yyyy") : "—");

export default function Portal({ token, campaignId }: { token: string; campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, u] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, client_name, campaign_name, client_logo_url, flight_start, flight_end, markets")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("units")
          .select(
            "id, unit_number, market, vendor, format, size, location_description, insight_bullets, four_week_impressions, total_cost, cpm, recommended, included, billboard_photo_url",
          )
          .eq("campaign_id", campaignId)
          .order("market", { ascending: true })
          .order("unit_number", { ascending: true }),
      ]);
      if (c.data) setCampaign(c.data as Campaign);
      // Only show RECOMMENDED units in the client presentation.
      // (The "recommended" toggle on the review page is the source of truth.)
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

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* Top bar — hidden on print */}
      <div className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur print:hidden">
        <div className="container-app flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Private proposal
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Cover */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div
          className="absolute inset-0 opacity-40"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--accent-gold) / 0.30), transparent 45%), radial-gradient(circle at 80% 80%, hsl(var(--secondary) / 0.35), transparent 50%)",
          }}
        />
        <div className="container-app relative py-20 md:py-28 text-primary-foreground">
          {campaign.client_logo_url && (
            <motion.img
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              src={campaign.client_logo_url}
              alt={`${campaign.client_name} logo`}
              className="mb-8 h-16 w-auto object-contain bg-card/95 rounded-md p-2"
            />
          )}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-gold"
          >
            Out-of-Home Proposal
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 font-heading text-5xl md:text-7xl font-bold tracking-tight"
          >
            {campaign.campaign_name}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-4 text-lg md:text-xl text-primary-foreground/85"
          >
            Prepared for{" "}
            <span className="font-semibold text-primary-foreground">
              {campaign.client_name}
            </span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-10 grid gap-4 sm:grid-cols-3 max-w-2xl"
          >
            <CoverStat icon={<Calendar className="h-4 w-4" />} label="Flight">
              {fmtDate(campaign.flight_start)} → {fmtDate(campaign.flight_end)}
            </CoverStat>
            <CoverStat icon={<MapPin className="h-4 w-4" />} label="Markets">
              {campaign.markets?.length ? campaign.markets.join(", ") : "—"}
            </CoverStat>
            <CoverStat icon={<Sparkles className="h-4 w-4" />} label="Recommended units">
              {units.length}
            </CoverStat>
          </motion.div>
        </div>
      </section>

      {/* Who we are */}
      <WhoWeAre />

      {/* Executive summary */}
      <section className="container-app py-16 md:py-20">
        <SectionHeading eyebrow="01" title="Executive summary" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Recommended units" value={String(stats.units)} icon={<Sparkles className="h-4 w-4" />} delay={0} />
          <SummaryCard label="4-Week impressions" value={fmtNum(stats.imps)} icon={<TrendingUp className="h-4 w-4" />} delay={0.1} />
          <SummaryCard label="Total investment" value={fmtMoney(stats.cost)} icon={<DollarSign className="h-4 w-4" />} delay={0.2} />
          <SummaryCard label="Blended CPM" value={stats.cpm == null ? "—" : `$${stats.cpm.toFixed(2)}`} delay={0.3} />
        </div>
      </section>

      {/* Recommended placements — carousel per market */}
      {byMarket.length > 0 && (
        <section className="container-app py-16 md:py-20 border-t">
          <SectionHeading eyebrow="02" title="Recommended placements" />
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Hand-picked units across {byMarket.length} market{byMarket.length === 1 ? "" : "s"}, optimized for visibility and impact.
          </p>
          <div className="mt-12 space-y-20">
            {byMarket.map(([market, list], idx) => (
              <MarketSection key={market} market={market} units={list} index={idx} />
            ))}
          </div>
        </section>
      )}

      {byMarket.length === 0 && (
        <section className="container-app py-20 text-center">
          <p className="text-muted-foreground">No recommended units selected yet.</p>
        </section>
      )}

      {/* Meet the team */}
      <MeetTheTeam />

      {/* Footer */}
      <footer className="border-t py-10 text-center text-xs text-muted-foreground">
        Prepared by {brand.name} · This proposal is confidential and intended only for{" "}
        {campaign.client_name}.
      </footer>
    </div>
  );
}

/* ---------------- Market section with carousel ---------------- */

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

  const current = units[selected] ?? units[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-6 flex items-end justify-between gap-4 print:hidden">
        <div>
          <div className="text-xs font-semibold tracking-[0.3em] uppercase text-accent-gold">
            Market {String(index + 1).padStart(2, "0")}
          </div>
          <h3 className="mt-1 font-heading text-3xl md:text-4xl flex items-center gap-2 text-foreground">
            <MapPin className="h-6 w-6 text-accent-gold" />
            {market}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground hidden sm:inline">
            {units.length} unit{units.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => emblaApi?.scrollPrev()}
            className="rounded-full border bg-card p-2 text-foreground shadow-elev-sm transition hover:bg-accent disabled:opacity-40"
            aria-label="Previous unit"
            disabled={units.length <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            className="rounded-full border bg-card p-2 text-foreground shadow-elev-sm transition hover:bg-accent disabled:opacity-40"
            aria-label="Next unit"
            disabled={units.length <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Carousel — screen only */}
      <div className="overflow-hidden rounded-[var(--radius)] print:hidden" ref={emblaRef}>
        <div className="flex">
          {units.map((u) => (
            <div key={u.id} className="min-w-0 flex-[0_0_100%] md:flex-[0_0_85%] lg:flex-[0_0_72%] pr-4">
              <UnitHero unit={u} />
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      {units.length > 1 && (
        <div className="mt-4 flex justify-center gap-2 print:hidden">
          {units.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === selected ? "w-8 bg-accent-gold" : "w-2 bg-border hover:bg-muted-foreground/40"
              }`}
              aria-label={`Go to unit ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Details panel — animates with selection */}
      <div className="mt-6 print:hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <UnitDetails unit={current} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Print fallback — show all units stacked */}
      <div className="hidden print:block space-y-6">
        {units.map((u) => (
          <div key={u.id}>
            <UnitHero unit={u} />
            <div className="mt-4">
              <UnitDetails unit={u} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ---------------- Unit hero (image + headline) ---------------- */

function UnitHero({ unit }: { unit: Unit }) {
  return (
    <article className="surface-card overflow-hidden break-inside-avoid">
      <div className="relative aspect-[16/9] bg-muted">
        {unit.billboard_photo_url ? (
          <img
            src={unit.billboard_photo_url}
            alt={`Unit ${unit.unit_number}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-10 w-10" />
          </div>
        )}
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              "linear-gradient(180deg, transparent 40%, hsl(var(--primary) / 0.85) 100%)",
          }}
        />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="rounded-md bg-card/95 backdrop-blur px-2.5 py-1 text-xs font-bold tracking-wide">
            #{unit.unit_number}
          </span>
          {unit.format && (
            <span className="rounded-md bg-accent-gold backdrop-blur px-2.5 py-1 text-xs font-semibold text-accent-gold-foreground">
              {unit.format}
            </span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 text-primary-foreground">
          {unit.market && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-gold">
              {unit.market}
            </div>
          )}
          <h4 className="mt-1 font-heading text-2xl md:text-3xl font-bold leading-tight">
            {unit.location_description ?? `Unit ${unit.unit_number}`}
          </h4>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Unit details (full quote info) ---------------- */

function UnitDetails({ unit }: { unit: Unit }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* KPIs */}
      <div className="md:col-span-2 surface-card p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Quote details
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <DetailStat icon={<Eye className="h-4 w-4" />} label="4-Week Impressions" value={fmtNum(unit.four_week_impressions)} />
          <DetailStat icon={<DollarSign className="h-4 w-4" />} label="Investment" value={fmtMoney(unit.total_cost)} />
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

      {/* Why we recommend */}
      <div className="surface-card p-6 bg-secondary/40">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-gold">
          Why we recommend
        </div>
        {unit.insight_bullets && unit.insight_bullets.length > 0 ? (
          <ul className="mt-3 space-y-2.5 text-sm text-foreground">
            {unit.insight_bullets.slice(0, 5).map((b, i) => (
              <li key={i} className="flex gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-accent-gold" />
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
      <div className="mt-1 font-heading text-lg font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

/* ---------------- Cover & summary helpers ---------------- */

function CoverStat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-gold">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <div className="text-xs font-bold tracking-[0.3em] text-accent-gold">{eyebrow}</div>
      <h2 className="mt-2 font-heading text-3xl md:text-4xl text-foreground">{title}</h2>
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  delay = 0,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="surface-card p-6 transition-shadow hover:shadow-elev-md"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl text-foreground tabular-nums">{value}</div>
    </motion.div>
  );
}
