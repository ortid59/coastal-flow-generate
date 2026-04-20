import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, MapPin, Sparkles, ImageOff, Calendar, TrendingUp, DollarSign } from "lucide-react";
import { format } from "date-fns";
import brand from "@/config/brand.json";

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
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
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
          .order("recommended", { ascending: false })
          .order("market", { ascending: true })
          .order("unit_number", { ascending: true }),
      ]);
      if (c.data) setCampaign(c.data as Campaign);
      setUnits(((u.data ?? []) as Unit[]).filter((x) => x.included !== false));
      setLoading(false);
    })();
  }, [campaignId]);

  const recommended = useMemo(() => units.filter((u) => u.recommended), [units]);
  const others = useMemo(() => units.filter((u) => !u.recommended), [units]);

  const stats = useMemo(() => {
    const imps = units.reduce((s, u) => s + (u.four_week_impressions ?? 0), 0);
    const cost = units.reduce((s, u) => s + (u.total_cost ?? 0), 0);
    const cpm = imps > 0 ? (cost / imps) * 1000 : null;
    return { units: units.length, imps, cost, cpm };
  }, [units]);

  const byMarket = useMemo(() => {
    const map = new Map<string, Unit[]>();
    recommended.forEach((u) => {
      const m = u.market ?? "Other";
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(u);
    });
    return Array.from(map.entries());
  }, [recommended]);

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
      <div className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur print:hidden">
        <div className="container-app flex h-14 items-center justify-between">
          <div className="text-xs text-muted-foreground">Private proposal · {brand.name}</div>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Cover */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--accent-gold) / 0.25), transparent 40%), radial-gradient(circle at 80% 80%, hsl(var(--secondary) / 0.3), transparent 50%)",
          }}
        />
        <div className="container-app relative py-16 md:py-24 text-primary-foreground">
          {campaign.client_logo_url && (
            <img
              src={campaign.client_logo_url}
              alt={`${campaign.client_name} logo`}
              className="mb-8 h-16 w-auto object-contain bg-card/95 rounded-md p-2"
            />
          )}
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground/70">
            Out-of-Home Proposal
          </div>
          <h1 className="mt-3 font-heading text-4xl md:text-6xl font-bold">
            {campaign.campaign_name}
          </h1>
          <p className="mt-3 text-lg md:text-xl text-primary-foreground/80">
            Prepared for {campaign.client_name}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 max-w-2xl">
            <CoverStat icon={<Calendar className="h-4 w-4" />} label="Flight">
              {fmtDate(campaign.flight_start)} → {fmtDate(campaign.flight_end)}
            </CoverStat>
            <CoverStat icon={<MapPin className="h-4 w-4" />} label="Markets">
              {campaign.markets?.length ? campaign.markets.join(", ") : "—"}
            </CoverStat>
            <CoverStat icon={<Sparkles className="h-4 w-4" />} label="Recommended units">
              {recommended.length} of {units.length}
            </CoverStat>
          </div>
        </div>
      </section>

      {/* Executive summary */}
      <section className="container-app py-12 md:py-16">
        <SectionHeading eyebrow="01" title="Executive summary" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total units" value={String(stats.units)} />
          <SummaryCard
            label="4-Week impressions"
            value={fmtNum(stats.imps)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <SummaryCard
            label="Total investment"
            value={fmtMoney(stats.cost)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <SummaryCard
            label="Blended CPM"
            value={stats.cpm == null ? "—" : `$${stats.cpm.toFixed(2)}`}
          />
        </div>
      </section>

      {/* Recommended by market */}
      {byMarket.length > 0 && (
        <section className="container-app py-12 md:py-16 border-t">
          <SectionHeading eyebrow="02" title="Recommended placements" />
          <div className="mt-10 space-y-14">
            {byMarket.map(([market, list]) => (
              <div key={market}>
                <div className="mb-6 flex items-end justify-between gap-4">
                  <h3 className="font-heading text-2xl flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-accent-gold" />
                    {market}
                  </h3>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {list.length} unit{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {list.map((u) => (
                    <UnitCard key={u.id} unit={u} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Appendix */}
      {others.length > 0 && (
        <section className="container-app py-12 md:py-16 border-t">
          <SectionHeading eyebrow="03" title="Additional inventory" />
          <div className="mt-6 surface-card overflow-hidden">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {others.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium">{u.unit_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.market ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div>{u.format ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.size ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 max-w-md truncate">{u.location_description ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(u.four_week_impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(u.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t py-10 text-center text-xs text-muted-foreground">
        Prepared by {brand.name} · This proposal is confidential and intended only for {campaign.client_name}.
      </footer>
    </div>
  );
}

function CoverStat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-card/10 backdrop-blur-sm border border-primary-foreground/15 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-sm text-primary-foreground">{children}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-xs font-bold tracking-[0.3em] text-accent-gold">{eyebrow}</div>
      <h2 className="mt-2 font-heading text-3xl md:text-4xl">{title}</h2>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl">{value}</div>
    </div>
  );
}

function UnitCard({ unit }: { unit: Unit }) {
  return (
    <article className="surface-card overflow-hidden flex flex-col break-inside-avoid">
      <div className="relative aspect-[16/10] bg-muted">
        {unit.billboard_photo_url ? (
          <img
            src={unit.billboard_photo_url}
            alt={`Unit ${unit.unit_number}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="rounded-md bg-card/95 backdrop-blur px-2 py-1 text-xs font-semibold">
            #{unit.unit_number}
          </span>
          {unit.format && (
            <span className="rounded-md bg-primary/90 backdrop-blur px-2 py-1 text-xs font-medium text-primary-foreground">
              {unit.format}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {unit.market && (
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {unit.market}
          </div>
        )}
        <h4 className="mt-1 font-heading text-lg leading-snug">
          {unit.location_description ?? `Unit ${unit.unit_number}`}
        </h4>
        {unit.insight_bullets && unit.insight_bullets.length > 1 && (
          <ul className="mt-3 list-disc pl-4 space-y-1 text-sm text-muted-foreground">
            {unit.insight_bullets.slice(0, 4).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-5 grid grid-cols-3 gap-3 border-t mt-5 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</div>
            <div className="font-medium">{unit.size ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">4wk Imp</div>
            <div className="font-medium tabular-nums">{fmtNum(unit.four_week_impressions)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div>
            <div className="font-medium tabular-nums">{fmtMoney(unit.total_cost)}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
