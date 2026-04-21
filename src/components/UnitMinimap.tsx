import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { googleMapsLink } from "@/lib/googleMaps";
import { ExternalLink, MapPin, Loader2 } from "lucide-react";

type Props = {
  lat: number | null;
  lng: number | null;
  unitNumber: string;
  className?: string;
};

// Module-level cache so multiple cards for the same point only fetch once.
const cache = new Map<string, Promise<string | null>>();

function fetchMinimap(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key)!;
  const p = supabase.functions
    .invoke("fetch-minimaps", { body: { points: [{ lat, lng }] } })
    .then((res) => {
      if (res.error) {
        console.warn("[UnitMinimap] invoke failed:", res.error.message);
        return null;
      }
      const r = (res.data as any)?.results?.[0];
      return r?.url ?? null;
    })
    .catch((e) => {
      console.warn("[UnitMinimap] error:", e);
      return null;
    });
  cache.set(key, p);
  return p;
}

export function UnitMinimap({ lat, lng, unitNumber, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    setLoading(true);
    fetchMinimap(lat, lng).then((u) => {
      if (cancelled) return;
      setUrl(u);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (lat == null || lng == null) return null;

  const link = googleMapsLink(lat, lng);

  return (
    <div className={`inline-block ${className ?? ""}`}>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open Unit ${unitNumber} in Google Maps`}
        className="group block relative w-[200px] h-[125px] rounded-xl overflow-hidden border border-border bg-secondary shadow-elev-sm transition-all hover:shadow-elev-md hover:-translate-y-0.5"
      >
        {url ? (
          <img
            src={url}
            alt={`Map for unit ${unitNumber}`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-5 w-5" />}
          </div>
        )}
        {/* Centered gold pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <MapPin
              className="h-7 w-7 text-[hsl(var(--accent-gold))] drop-shadow-[0_2px_4px_rgba(11,30,58,0.45)]"
              fill="hsl(var(--accent-gold))"
              strokeWidth={2}
            />
          </div>
        </div>
      </a>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--ocean))] underline underline-offset-2 hover:text-[hsl(var(--accent-gold))] transition-colors"
      >
        View on Google Maps
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
