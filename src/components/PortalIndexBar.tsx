import { ImageOff } from "lucide-react";
import { parseShortAddress } from "@/lib/shortAddress";
import { fmtCompactImpressions, fmtRateShort } from "@/lib/format";

type ChipUnit = {
  id: string;
  unit_number: string;
  location_description: string | null;
  billboard_photo_url: string | null;
  weekly_impressions?: number | null;
  four_week_impressions?: number | null;
  total_cost: number | null;
};

type Props = {
  units: ChipUnit[];
};

export function PortalIndexBar({ units }: Props) {
  if (!units.length) return null;

  const onClick = (id: string) => {
    window.dispatchEvent(new CustomEvent("cm:focus-unit", { detail: { id } }));
    const el = document.getElementById(`unit-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Unit index"
      className="sticky top-14 z-10 border-y border-border bg-card/95 backdrop-blur print:hidden"
    >
      <div className="container-app py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="shrink-0 pr-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--ocean))]">
            Index
          </span>
          {units.map((u, i) => {
            const short = parseShortAddress(u.location_description) || `Unit ${u.unit_number}`;
            // Approximate weekly impressions if missing: 4-week / 4
            const weekly =
              u.weekly_impressions ??
              (u.four_week_impressions ? Math.round(u.four_week_impressions / 4) : null);
            return (
              <button
                key={u.id}
                onClick={() => onClick(u.id)}
                className="group flex min-w-[220px] shrink-0 items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-all hover:border-[hsl(var(--accent-gold))] hover:shadow-elev-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-gold))]"
              >
                <div className="relative h-[35px] w-[50px] shrink-0 overflow-hidden rounded bg-muted">
                  {u.billboard_photo_url ? (
                    <img
                      src={u.billboard_photo_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-3 w-3" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold text-[hsl(var(--accent-gold))]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-xs font-semibold text-foreground">{short}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{fmtCompactImpressions(weekly)}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{fmtRateShort(u.total_cost)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
