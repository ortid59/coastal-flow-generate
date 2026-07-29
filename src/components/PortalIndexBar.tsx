import { ImageOff, MapPin, Sparkles } from "lucide-react";
import { displayAddress } from "@/lib/shortAddress";
import { fmtCompactImpressions, fmtRateShort } from "@/lib/format";

type ChipUnit = {
  id: string;
  unit_number: string;
  location_description: string | null;
  address?: string | null;
  billboard_photo_url: string | null;
  weekly_impressions?: number | null;
  four_week_impressions?: number | null;
  total_cost: number | null;
  negotiated_rate_4wk?: number | null;
  four_week_periods?: number | null;
  format?: string | null;
  market?: string | null;
  recommended?: boolean | null;
};

type Props = {
  units: ChipUnit[];
  marginMult?: number;
};


/**
 * Portal "Index" — proper table-of-contents style section listing,
 * displayed as a 2-column vertical grid of small tiles.
 * Each tile links to the corresponding `#unit-{id}` anchor on the page.
 */
export function PortalIndexBar({ units, marginMult = 1 }: Props) {
  if (!units.length) return null;


  const onClick = (id: string) => {
    window.dispatchEvent(new CustomEvent("cm:focus-unit", { detail: { id } }));
    const el = document.getElementById(`unit-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section aria-label="Proposal index" className="bg-card border-y border-border print:hidden">
      <div className="container-app py-12 md:py-16">
        {/* Section header */}
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow">Contents</div>
            <h2 className="mt-2 font-heading text-2xl md:text-4xl font-bold uppercase tracking-tight text-foreground">
              Proposal Index
            </h2>
            <span className="mt-4 block h-[3px] w-16 bg-[hsl(var(--accent-gold))] rounded-full" />
          </div>
          <p className="text-sm text-muted-foreground">
            {units.length} placement{units.length === 1 ? "" : "s"} · Click any entry to jump to its details
          </p>
        </div>

        {/* 2-column grid of small tiles */}
        <ol className="grid gap-3 sm:grid-cols-2">
          {units.map((u, i) => {
            const short = displayAddress(u) || `Unit ${u.unit_number}`;
            const weekly =
              u.weekly_impressions ??
              (u.four_week_impressions ? Math.round(u.four_week_impressions / 4) : null);
            return (
              <li key={u.id}>
                <button
                  onClick={() => onClick(u.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-all hover:border-[hsl(var(--accent-gold))] hover:shadow-elev-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-gold))] ${
                    u.recommended
                      ? "border-[hsl(var(--accent-gold)/0.6)] bg-[hsl(var(--accent-gold)/0.05)]"
                      : "border-border"
                  }`}
                >
                  {/* Index number */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--primary))] font-mono text-xs font-bold text-[hsl(var(--accent-gold))]">
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* Thumbnail */}
                  <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {u.billboard_photo_url ? (
                      <img
                        src={u.billboard_photo_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" />
                      </div>
                    )}
                    {u.recommended && (
                      <span
                        title="Recommended"
                        className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground))] shadow-elev-sm"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-semibold text-foreground group-hover:text-[hsl(var(--ocean))]">
                        {short}
                      </div>
                      {u.recommended && (
                        <span className="shrink-0 rounded-sm bg-[hsl(var(--accent-gold))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--accent-gold-foreground))]">
                          Rec
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {u.format && <span>{u.format}</span>}
                      {u.format && (u.market || weekly != null) && <span aria-hidden>·</span>}
                      {u.market && <span>{u.market}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                      #{u.unit_number}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{fmtCompactImpressions(weekly)}</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{fmtRateShort(u.total_cost)}</span>
                    </div>
                  </div>

                  {/* Page indicator */}
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[hsl(var(--accent-gold))]" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
