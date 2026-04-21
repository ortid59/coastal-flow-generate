// fetch-minimaps
//
// Generates and caches a Google Static Maps PNG for a (lat, lng) point.
// Files are stored in the public `minimaps` bucket as `{lat},{lng}.png`
// and the bucket's public URL is returned to the caller.
//
// POST { points: [{ lat: number, lng: number }, ...] }
//   -> { results: [{ lat, lng, url }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STYLE_PARAMS = [
  "feature:all|element:labels.icon|visibility:off",
  "feature:poi|visibility:off",
  "feature:transit|visibility:off",
  "feature:water|color:0xD8E6F0",
  "feature:road|element:geometry|color:0xFFFFFF",
  "feature:road|element:labels.text.fill|color:0x6B7A8D",
  "feature:landscape|color:0xF7F9FC",
  "feature:administrative|element:geometry.stroke|color:0xC8D4E0",
];

function buildStaticMapUrl(lat: number, lng: number, key: string): string {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "16",
    size: "400x250",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0x005080|${lat},${lng}`,
    key,
  });
  const styleQS = STYLE_PARAMS.map((s) => `style=${encodeURIComponent(s)}`).join("&");
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}&${styleQS}`;
}

function objectKey(lat: number, lng: number): string {
  // 5 decimal places ≈ 1.1m precision — good for caching
  return `${lat.toFixed(5)},${lng.toFixed(5)}.png`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { points?: Array<{ lat: number; lng: number }> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const points = (body.points ?? []).filter(
    (p) =>
      typeof p?.lat === "number" &&
      typeof p?.lng === "number" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng),
  );

  if (points.length === 0) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ lat: number; lng: number; url: string | null; error?: string }> = [];

  await Promise.all(
    points.map(async ({ lat, lng }) => {
      const key = objectKey(lat, lng);
      try {
        // Check if already cached
        const existing = supabase.storage.from("minimaps").getPublicUrl(key);
        // Try a HEAD-style check by attempting to download metadata
        const head = await fetch(existing.data.publicUrl, { method: "HEAD" });
        if (head.ok) {
          results.push({ lat, lng, url: existing.data.publicUrl });
          return;
        }

        // Fetch from Google
        const mapUrl = buildStaticMapUrl(lat, lng, apiKey);
        const resp = await fetch(mapUrl);
        if (!resp.ok) {
          const txt = await resp.text();
          console.warn(`[fetch-minimaps] Google ${resp.status} for ${lat},${lng}:`, txt.slice(0, 200));
          results.push({ lat, lng, url: null, error: `Google ${resp.status}` });
          return;
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const up = await supabase.storage.from("minimaps").upload(key, bytes, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "31536000",
        });
        if (up.error) {
          results.push({ lat, lng, url: null, error: up.error.message });
          return;
        }
        const { data } = supabase.storage.from("minimaps").getPublicUrl(key);
        results.push({ lat, lng, url: data.publicUrl });
      } catch (e: any) {
        results.push({ lat, lng, url: null, error: e?.message ?? String(e) });
      }
    }),
  );

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
