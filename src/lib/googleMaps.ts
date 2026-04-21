// Shared Google Maps JS API loader + brand styling.
//
// Calls fetch() ONCE per page load — subsequent callers reuse the same Promise.
// Uses the public anon-safe key exposed via VITE_GOOGLE_MAPS_API_KEY.
// (The same key is also used server-side as GOOGLE_MAPS_API_KEY.)

declare global {
  interface Window {
    google?: any;
    __cmGoogleMapsLoader?: Promise<any>;
  }
}

const PUBLIC_KEY = "AIzaSyD_2WjeS9AiNfB2aaVYz5fv0rqw5Nu4sCw";

export const BRAND_MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", stylers: [{ color: "#D8E6F0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6B7A8D" }] },
  { featureType: "landscape", stylers: [{ color: "#F7F9FC" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#C8D4E0" }] },
] as const;

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__cmGoogleMapsLoader) return window.__cmGoogleMapsLoader;

  window.__cmGoogleMapsLoader = new Promise((resolve, reject) => {
    const cbName = `__cmGmapsCb_${Date.now()}`;
    (window as any)[cbName] = () => {
      delete (window as any)[cbName];
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps loaded but window.google missing"));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${PUBLIC_KEY}&callback=${cbName}&v=weekly&libraries=marker`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps JS API"));
    document.head.appendChild(s);
  });

  return window.__cmGoogleMapsLoader;
}

/**
 * Build an SVG data URL for a navy circle marker with a gold border + white unit number.
 * Returns a Google Maps Icon-shaped object.
 */
export function brandedMarkerIcon(unitNumber: string, opts?: { highlighted?: boolean }) {
  const size = opts?.highlighted ? 48 : 40;
  const stroke = opts?.highlighted ? 4 : 3;
  const navy = "#0B1E3A";
  const gold = "#C09030";
  const fontSize = unitNumber.length > 5 ? 10 : unitNumber.length > 3 ? 12 : 14;
  // Trim very long unit numbers for legibility
  const label = unitNumber.length > 6 ? unitNumber.slice(-5) : unitNumber;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}" viewBox="0 0 ${size} ${size + 8}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${navy}" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path d="M${size / 2} ${size + 6} L${size / 2 - 6} ${size - 4} L${size / 2 + 6} ${size - 4} Z" fill="${gold}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - stroke / 2}" fill="${navy}" stroke="${gold}" stroke-width="${stroke}" filter="url(#s)"/>
  <text x="${size / 2}" y="${size / 2 + fontSize / 3}" text-anchor="middle" font-family="Oswald, Montserrat, sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="0.5">${label}</text>
</svg>`.trim();
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size + 8 },
    anchor: { x: size / 2, y: size + 6 },
  };
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
