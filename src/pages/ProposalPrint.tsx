import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Calendar, Sparkles, Eye, DollarSign, Ruler, ImageOff } from "lucide-react";
import { format } from "date-fns";
import brand from "@/config/brand.json";
import { Logo } from "@/components/Logo";
import { WhoWeAre } from "@/components/WhoWeAre";
import { MeetTheTeam } from "@/components/MeetTheTeam";

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
      // Small delay so images start loading
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

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @page { size: Letter; margin: 0.6in; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; animation: none !important; transition: none !important; }
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-page-break { page-break-before: always; }
          .print-unit-page { page-break-inside: avoid; page-break-after: always; }
          nav, header, footer, .sticky { display: none !important; }

          /* P2 — Cover hero compact */
          .print-cover-section { page-break-after: always; }
          .print-cover-hero { height: 200px !important; max-height: 200px !important; }

          /* P3 — Unit card fits one page */
          .print-unit-page .print-unit-photo { height: 240px !important; max-height: 240px !important; }

          /* P4 — Who We Are: hide decorative overlap layer */
          .print-wwa-hide { display: none !important; }

          /* P5 — Team: hide empty photo circles */
          .print-team-photo-empty { display: none !important; }
        }
        @media screen {
          .proposal-print-root { max-width: 850px; margin: 0 auto; padding: 24px; }
        }
      `}</style>

      <div className="proposal-print-root bg-white text-black min-h-screen">
        {/* Screen-only info bar */}
        <div className="no-print mb-6 p-4 bg-muted rounded-lg flex items-center justify-between">
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

        {/* ===== COVER ===== */}
        <section className="print-cover-section mb-0">
          <div className="flex items-start justify-between mb-6">
            <Logo size={40} />
            {campaign.client_logo_url && (
              <img src={campaign.client_logo_url} alt={`${campaign.client_name} logo`} className="h-12 w-auto" />
            )}
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Out-of-Home Proposal
          </p>
          <h1 className="text-4xl font-bold uppercase tracking-tight text-gray-900 leading-tight">
            {campaign.proposal_name || campaign.campaign_name}
          </h1>
          <div className="mt-2 h-[3px] w-16 bg-amber-500 rounded-full" />
          <p className="mt-4 text-base text-gray-600">
            Prepared for <span className="font-semibold text-gray-900">{campaign.client_name}</span>
          </p>
          <div className="mt-6 flex gap-8 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-gray-400" />
              {flightLabel}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gray-400" />
              {primaryMarket}
            </div>
          </div>
          {heroPhoto && (
            <div className="mt-8 rounded-lg overflow-hidden border border-gray-200">
              <img src={heroPhoto} alt="Featured billboard" className="w-full h-64 print-cover-hero object-cover" />
            </div>
          )}
        </section>

        {/* ===== WHO WE ARE (print-safe) ===== */}
        <div className="print-page-break">
          <section className="py-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">About the Agency</p>
            <h2 className="text-3xl font-bold uppercase tracking-tight text-gray-900">Who We Are</h2>
            <div className="mt-2 h-[3px] w-16 bg-amber-500 rounded-full" />
            <div className="mt-6 space-y-4">
              <p className="text-base text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-900">Coastal Maverick</span> is a woman-owned boutique out-of-home (OOH) media agency specializing in high-impact, highly customized OOH campaigns. From concept to completion, we serve as a strategic partner for brands looking to make a bold visual statement in the physical world.
              </p>
              <p className="text-base text-gray-600 leading-relaxed">
                With 360-degree experience across media owner, client, and agency sides, we bring a unique perspective that fuels smarter strategy and greater impact.
              </p>
              <ul className="mt-4 space-y-2 border-l-[3px] border-amber-500 pl-4">
                <li className="text-lg font-semibold uppercase tracking-wide text-gray-900">Woman-Owned.</li>
                <li className="text-lg font-semibold uppercase tracking-wide text-gray-900">Boutique.</li>
                <li className="text-lg font-semibold uppercase tracking-wide text-gray-900">Built for Impact.</li>
              </ul>
            </div>
          </section>
        </div>

        {/* ===== RECOMMENDED PLACEMENTS + MAP ===== */}
        <div className="print-page-break">
          <section className="py-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              02 · Placements
            </p>
            <h2 className="text-3xl font-bold uppercase tracking-tight text-gray-900">
              Recommended Placements
            </h2>
            <div className="mt-2 h-[3px] w-16 bg-amber-500 rounded-full" />

            {campaign.vendor_overview_map_url && (
              <div className="mt-8">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                  Campaign Coverage Map
                </p>
                <div className="rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={campaign.vendor_overview_map_url}
                    alt="Campaign coverage map"
                    className="w-full h-auto object-contain"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ===== CAMPAIGN OPTIONS ===== */}
        {activeTiers.length >= 2 && (
          <div className="print-page-break">
            <section className="py-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Campaign Options
              </p>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${activeTiers.length}, 1fr)` }}>
                {activeTiers.map((tier) => {
                  const tierUnits = units.filter((u) => u.included && u[tier.key]);
                  const totalCost = tierUnits.reduce((sum, u) => sum + (u.total_cost ?? 0), 0);
                  const totalImpressions = tierUnits.reduce((sum, u) => sum + (u.four_week_impressions ?? 0), 0);
                  return (
                    <div key={tier.key} className="border border-gray-200 rounded-lg p-5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{tier.label}</p>
                      {totalCost > 0 && (
                        <p className="text-2xl font-bold text-gray-900">{fmtMoney(totalCost)}</p>
                      )}
                      <div className="mt-3 text-sm text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Placements</span>
                          <span className="font-semibold">{tierUnits.length}</span>
                        </div>
                        {totalImpressions > 0 && (
                          <div className="flex justify-between">
                            <span>4-Week Impressions</span>
                            <span className="font-semibold">{fmtNum(totalImpressions)}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Includes</p>
                        <ul className="text-xs text-gray-600 space-y-0.5">
                          {tierUnits.map((u) => (
                            <li key={u.id}>• {u.location_description ?? u.unit_number}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ===== INDEX ===== */}
        <div className="print-page-break">
          <section className="py-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Unit Index
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 text-left text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-2">Unit #</th>
                  <th className="py-2 pr-2">Location</th>
                  <th className="py-2 pr-2">Market</th>
                  <th className="py-2 pr-2">Format</th>
                  <th className="py-2 pr-2">Size</th>
                  <th className="py-2 pr-2 text-right">4-Wk Impr.</th>
                  <th className="py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2 font-mono">#{u.unit_number}</td>
                    <td className="py-1.5 pr-2 max-w-[200px] truncate">{u.location_description ?? "—"}</td>
                    <td className="py-1.5 pr-2">{u.market ?? "—"}</td>
                    <td className="py-1.5 pr-2">{u.format ?? "—"}</td>
                    <td className="py-1.5 pr-2">{u.size ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(u.four_week_impressions)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMoney(u.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* ===== NEXT STEPS ===== */}
        <div className="print-page-break">
          <section className="py-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              03 · Process
            </p>
            <h2 className="text-3xl font-bold uppercase tracking-tight text-gray-900 mb-6">
              Next Steps
            </h2>
            <div className="grid grid-cols-4 gap-6">
              {[
                { n: "01", title: "Review & Feedback", body: "Walk through the proposal and share questions." },
                { n: "02", title: "Final Approval", body: "Confirm the unit list and flight dates." },
                { n: "03", title: "Insertion Order", body: "Sign IOs and lock vendor inventory." },
                { n: "04", title: "Campaign Goes Live", body: "Creative installed, monitoring begins." },
              ].map((s) => (
                <div key={s.n} className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 font-bold text-sm text-gray-600">
                    {s.n}
                  </div>
                  <h3 className="mt-3 text-sm font-bold uppercase tracking-wide text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-xs text-gray-500">{s.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ===== MEET THE TEAM (print-safe) ===== */}
        <div className="print-page-break">
          <section className="py-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">The Team</p>
            <h2 className="text-3xl font-bold uppercase tracking-tight text-gray-900 mb-8">Meet The Team</h2>
            <div className="mt-2 h-[3px] w-16 bg-amber-500 rounded-full mb-8" />
            <div className="grid grid-cols-3 gap-8">
              {[
                { name: "Heather", role: "Founder & CEO" },
                { name: "Via", role: "Creative Media Coordinator" },
                { name: "Roxie", role: "Chief Happiness Officer" },
              ].map((m) => (
                <div key={m.name} className="text-center">
                  <h3 className="text-lg font-bold uppercase tracking-wide text-gray-900">{m.name}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500">{m.role}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ===== INDIVIDUAL UNIT PAGES ===== */}
        {units.map((unit) => (
          <article key={unit.id} className="print-unit-page print-page-break py-6">
            {/* Billboard photo */}
            <div className="rounded-lg overflow-hidden border border-gray-200 mb-4">
              {unit.billboard_photo_url ? (
                <img
                  src={unit.billboard_photo_url}
                  alt={`Unit ${unit.unit_number}`}
                  className="w-full h-56 print-unit-photo object-cover"
                />
              ) : (
                <div className="w-full h-56 print-unit-photo flex items-center justify-center bg-gray-100 text-gray-400">
                  <ImageOff className="h-12 w-12" />
                </div>
              )}
            </div>

            {/* Unit header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-xs text-gray-400 mb-1">#{unit.unit_number}</p>
                <h3 className="text-xl font-bold text-gray-900">
                  {unit.location_description ?? `Unit ${unit.unit_number}`}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[unit.market, unit.city, unit.zip].filter(Boolean).join(" · ")}
                </p>
              </div>
              {unit.recommended && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                  Recommended
                </span>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatBox label="Format" value={unit.format ?? "—"} />
              <StatBox label="Size" value={unit.size ?? "—"} />
              <StatBox label="4-Wk Impressions" value={fmtNum(unit.four_week_impressions)} />
              <StatBox label="4-Week Rate" value={fmtMoney(unit.total_cost)} />
            </div>

            {/* Additional details row */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Highlights */}
              {(unit.highlights || (unit.insight_bullets && unit.insight_bullets.length > 0)) && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
                    Highlights
                  </p>
                  {unit.insight_bullets && unit.insight_bullets.length > 0 ? (
                    <ul className="text-xs text-gray-700 space-y-1.5">
                      {unit.insight_bullets.slice(0, 5).map((b, i) => (
                        <li key={i} className="flex gap-1.5">
                          <Sparkles className="h-3 w-3 mt-0.5 flex-none text-amber-500" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-600">{unit.highlights}</p>
                  )}
                </div>
              )}

              {/* Inset map */}
              {unit.inset_map_url && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <img
                    src={unit.inset_map_url}
                    alt={`Map for unit ${unit.unit_number}`}
                    className="w-full h-48 object-cover"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between text-[9px] text-gray-400 tracking-wide pt-3 border-t border-gray-200">
              <span>coastalmaverick.com</span>
              <span>{campaign.client_name}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}
