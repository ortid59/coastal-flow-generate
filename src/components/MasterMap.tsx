import { useEffect, useRef } from "react";
import { loadGoogleMaps, BRAND_MAP_STYLE, brandedMarkerIcon } from "@/lib/googleMaps";

export type MapPoint = {
  id: string;
  unit_number: string;
  lat: number;
  lng: number;
  title?: string;
  location?: string | null;
  impressions?: number | null;
  rate?: number | null;
};

type Props = {
  points: MapPoint[];
  highlightedId?: string | null;
  onMarkerClick?: (point: MapPoint) => void;
  className?: string;
};

const fmtNum = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMoney = (n?: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function MasterMap({ points, highlightedId, onMarkerClick, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const infoRef = useRef<any>(null);
  const onClickRef = useRef(onMarkerClick);
  onClickRef.current = onMarkerClick;

  // Initialize map once.
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || points.length === 0) return;

    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        const center = { lat: points[0].lat, lng: points[0].lng };
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: 12,
          styles: BRAND_MAP_STYLE,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: "greedy",
          backgroundColor: "#F7F9FC",
        });
        mapRef.current = map;
        infoRef.current = new google.maps.InfoWindow();
        renderMarkers(google);
      })
      .catch((e) => {
        console.warn("[MasterMap] failed to load Google Maps:", e);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers when points change.
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    renderMarkers(window.google);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Update highlight state.
  useEffect(() => {
    if (!window.google?.maps) return;
    points.forEach((p) => {
      const m = markersRef.current.get(p.id);
      if (!m) return;
      m.setIcon(brandedMarkerIcon(p.unit_number, { highlighted: p.id === highlightedId }));
      m.setZIndex(p.id === highlightedId ? 999 : 1);
    });
    if (highlightedId && mapRef.current) {
      const target = points.find((p) => p.id === highlightedId);
      if (target) {
        mapRef.current.panTo({ lat: target.lat, lng: target.lng });
      }
    }
  }, [highlightedId, points]);

  function renderMarkers(google: any) {
    // Clear existing
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current.clear();

    if (points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: mapRef.current,
        icon: brandedMarkerIcon(p.unit_number, { highlighted: p.id === highlightedId }),
        title: p.title ?? `Unit ${p.unit_number}`,
        optimized: false,
      });
      marker.addListener("click", () => {
        const html = `
          <div style="font-family: Montserrat, sans-serif; padding: 4px 6px 6px; min-width: 180px;">
            <div style="font-family: Oswald, sans-serif; font-weight:700; font-size:14px; letter-spacing:0.05em; text-transform:uppercase; color:#0B1E3A;">${p.title ?? `Unit ${p.unit_number}`}</div>
            ${p.location ? `<div style="margin-top:4px; font-size:12px; color:#6B7A8D;">${escapeHtml(p.location)}</div>` : ""}
            <div style="margin-top:8px; display:flex; gap:12px; font-size:11px;">
              <div><div style="color:#6B7A8D; text-transform:uppercase; letter-spacing:0.08em;">Impressions</div><div style="font-family:Oswald; font-weight:700; color:#005080; font-size:13px;">${fmtNum(p.impressions)}</div></div>
              <div><div style="color:#6B7A8D; text-transform:uppercase; letter-spacing:0.08em;">Rate</div><div style="font-family:Oswald; font-weight:700; color:#C09030; font-size:13px;">${fmtMoney(p.rate)}</div></div>
            </div>
          </div>`;
        infoRef.current.setContent(html);
        infoRef.current.open({ map: mapRef.current, anchor: marker });
        onClickRef.current?.(p);
      });
      markersRef.current.set(p.id, marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });

    if (points.length > 1) {
      mapRef.current.fitBounds(bounds, 64);
    } else {
      mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lng });
      mapRef.current.setZoom(14);
    }
  }

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-secondary text-sm text-muted-foreground rounded-2xl ${className ?? ""}`}>
        No mapped units yet.
      </div>
    );
  }

  return <div ref={containerRef} className={`rounded-2xl overflow-hidden bg-[hsl(var(--off-white))] ${className ?? ""}`} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
