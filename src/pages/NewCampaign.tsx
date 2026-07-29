import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
  Sparkles,
  Plus,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";

type Vendor = {
  id: string;
  vendor_name: string;
  excel_files: File[];
  photo_pdfs: File[];
  flight_periods_override: string;
};

const MAX_VENDORS = 25;
const MAX_EXCEL_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PDF_BYTES = 500 * 1024 * 1024; // 500 MB

const newVendor = (): Vendor => ({
  id: crypto.randomUUID(),
  vendor_name: "",
  excel_files: [],
  photo_pdfs: [],
  flight_periods_override: "",
});


export default function NewCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [clientName, setClientName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [marketsRaw, setMarketsRaw] = useState("");
  const [flightStart, setFlightStart] = useState("");
  const [flightEnd, setFlightEnd] = useState("");
  const [marginPct, setMarginPct] = useState("20");

  const [vendors, setVendors] = useState<Vendor[]>([newVendor()]);
  const [logo, setLogo] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const updateVendor = (id: string, patch: Partial<Vendor>) =>
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const removeVendor = (id: string) =>
    setVendors((prev) => (prev.length === 1 ? [newVendor()] : prev.filter((v) => v.id !== id)));

  const addVendor = () => {
    if (vendors.length >= MAX_VENDORS) return;
    setVendors((prev) => [...prev, newVendor()]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!clientName.trim() || !campaignName.trim()) {
      toast({ title: "Missing details", description: "Client and campaign name are required.", variant: "destructive" });
      return;
    }

    // Validate vendor cards
    const cleaned = vendors
      .map((v) => ({ ...v, vendor_name: v.vendor_name.trim() }))
      .filter((v) => v.vendor_name || v.excel_files.length || v.photo_pdfs.length);

    if (cleaned.length === 0) {
      toast({ title: "Add at least one vendor", variant: "destructive" });
      return;
    }
    for (const v of cleaned) {
      if (!v.vendor_name) {
        toast({ title: "Vendor name is required", description: "Every vendor card needs a name.", variant: "destructive" });
        return;
      }
      if (v.excel_files.length === 0 && v.photo_pdfs.length === 0) {
        toast({ title: `${v.vendor_name}: add a file`, description: "Each vendor needs at least one Excel or PDF.", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const markets = marketsRaw.split(",").map((m) => m.trim()).filter(Boolean);

      setProgress("Creating campaign…");
      const { data: campaign, error: insErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          client_name: clientName.trim(),
          campaign_name: campaignName.trim(),
          proposal_name: proposalName.trim() || null,
          markets: markets.length ? markets : null,
          flight_start: flightStart || null,
          flight_end: flightEnd || null,
          margin_pct: marginPct ? Number(marginPct) : 20,
          status: "draft",
        })
        .select("id")
        .single();

      if (insErr || !campaign) throw insErr ?? new Error("Failed to create campaign");
      const campaignId = campaign.id;

      // Logo
      let logoUrl: string | null = null;
      if (logo) {
        setProgress("Uploading logo…");
        const path = `${campaignId}/${Date.now()}-${safeName(logo.name)}`;
        const up = await supabase.storage.from("logos").upload(path, logo, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = pub.publicUrl;
      }
      let coverUrl: string | null = null;
      if (cover) {
        setProgress("Uploading cover image…");
        const path = `${campaignId}/cover-${Date.now()}-${safeName(cover.name)}`;
        const up = await supabase.storage.from("logos").upload(path, cover, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        coverUrl = pub.publicUrl;
      }
      if (logoUrl || coverUrl) {
        await supabase
          .from("campaigns")
          .update({
            ...(logoUrl ? { client_logo_url: logoUrl } : {}),
            ...(coverUrl ? { cover_image_url: coverUrl } : {}),
          })
          .eq("id", campaignId);
      }

      // Upload vendor files
      const totalFiles = cleaned.reduce((n, v) => n + v.excel_files.length + v.photo_pdfs.length, 0);
      let done = 0;
      const records: Array<{
        kind: "excel" | "photosheets";
        storage_path: string;
        original_name: string;
        vendor: string;
      }> = [];
      // Track storage paths per vendor card so we can apply flight overrides
      // to the right units after parse-excel finishes.
      const cardPaths = new Map<string, string[]>();
      const cardOverride = new Map<string, number>();

      for (const v of cleaned) {
        const paths: string[] = [];
        const overrideVal = v.flight_periods_override.trim();
        if (overrideVal) {
          const n = Number(overrideVal);
          if (Number.isFinite(n) && n > 0) cardOverride.set(v.id, n);
        }
        for (const xf of v.excel_files) {
          done += 1;
          setProgress(`Uploading file ${done}/${totalFiles} — ${xf.name}`);
          const xPath = `${campaignId}/excel/${Date.now()}-${safeName(v.vendor_name)}-${safeName(xf.name)}`;
          const xUp = await supabase.storage.from("uploads").upload(xPath, xf, { upsert: false });
          if (xUp.error) throw xUp.error;
          records.push({ kind: "excel", storage_path: xPath, original_name: xf.name, vendor: v.vendor_name });
          paths.push(xPath);
        }
        for (const pf of v.photo_pdfs) {
          done += 1;
          setProgress(`Uploading file ${done}/${totalFiles} — ${pf.name}`);
          const pPath = `${campaignId}/photosheets/${Date.now()}-${safeName(v.vendor_name)}-${safeName(pf.name)}`;
          const pUp = await supabase.storage.from("uploads").upload(pPath, pf, { upsert: false });
          if (pUp.error) throw pUp.error;
          records.push({ kind: "photosheets", storage_path: pPath, original_name: pf.name, vendor: v.vendor_name });
          paths.push(pPath);
        }
        cardPaths.set(v.id, paths);
      }

      if (records.length) {
        setProgress("Saving file records…");
        const { error: vfErr } = await supabase
          .from("vendor_files")
          .insert(records.map((r) => ({ campaign_id: campaignId, ...r })));
        if (vfErr) throw vfErr;
      }

      toast({ title: "Campaign created", description: "Parsing vendor Excel…" });
      await supabase.from("campaigns").update({ status: "parsing" }).eq("id", campaignId);
      supabase.functions
        .invoke("parse-excel", { body: { campaign_id: campaignId } })
        .then(async ({ error }) => {
          if (error) {
            console.error("parse-excel invoke error", error);
            supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
            return;
          }
          // Best-effort: if a vendor_files.vendor string doesn't match a known
          // VENDOR_PROFILES key, rewrite it to the campaign's dominant
          // units.vendor so the client-side photo extraction can resolve a
          // profile reliably.
          try {
            const KNOWN_VENDOR_KEYS = ["alchemy", "adkom", "tasty", "cco", "clear channel", "clearchannel", "lamar", "be seen", "beseen", "ofm", "new tradition", "adams"];
            const matchesKnown = (v?: string | null) => {
              const s = (v ?? "").toLowerCase();
              return !!s && KNOWN_VENDOR_KEYS.some((k) => s.includes(k));
            };
            const [{ data: vfRows }, { data: uRows }] = await Promise.all([
              supabase.from("vendor_files").select("id, vendor, storage_path").eq("campaign_id", campaignId),
              supabase.from("units").select("vendor").eq("campaign_id", campaignId),
            ]);
            const counts = new Map<string, number>();
            for (const u of uRows ?? []) {
              const v = (u.vendor ?? "").trim();
              if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
            }
            let dominant: string | null = null;
            let best = -1;
            for (const [v, c] of counts) {
              if (matchesKnown(v) && c > best) { dominant = v; best = c; }
            }
            if (dominant) {
              for (const f of vfRows ?? []) {
                if (!matchesKnown(f.vendor) && f.vendor !== dominant) {
                  await supabase.from("vendor_files").update({ vendor: dominant }).eq("id", f.id);
                }
              }
            }

            // Apply per-vendor flight-length overrides captured at upload
            // time. For each card with an override, find the vendors
            // associated with the card's uploaded files (post-normalization)
            // and set units.four_week_periods for those vendors.
            if (cardOverride.size > 0) {
              const { data: vfRows2 } = await supabase
                .from("vendor_files")
                .select("vendor, storage_path")
                .eq("campaign_id", campaignId);
              const pathToVendor = new Map<string, string>();
              for (const r of vfRows2 ?? []) {
                if (r.storage_path && r.vendor) pathToVendor.set(r.storage_path, r.vendor);
              }
              for (const [cardId, periods] of cardOverride) {
                const paths = cardPaths.get(cardId) ?? [];
                const vendors = new Set<string>();
                for (const p of paths) {
                  const v = pathToVendor.get(p);
                  if (v) vendors.add(v);
                }
                for (const v of vendors) {
                  await supabase
                    .from("units")
                    .update({ four_week_periods: periods })
                    .eq("campaign_id", campaignId)
                    .eq("vendor", v);
                }
              }
            }
          } catch (e) {
            console.warn("post-parse vendor normalization failed", e);
          }
        });


      navigate(`/campaigns/${campaignId}/review`);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Something went wrong",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  };

  return (
    <main className="container-app py-10 md:py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="mb-8">
        <h1 className="font-heading">New Campaign</h1>
        <p className="mt-2 text-muted-foreground">
          Upload one card per vendor. We'll parse the Excels and tag each unit with its vendor.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <section className="surface-card p-6 space-y-5">
          <h3 className="font-heading">Campaign details</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client">Client name *</Label>
              <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Fitness Co." required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign name *</Label>
              <Input id="campaign" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Q3 Brand Awareness" required />
              <p className="text-[11px] text-muted-foreground">Internal reference name.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposal" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--accent-gold))]" />
              Proposal name
            </Label>
            <Input
              id="proposal"
              value={proposalName}
              onChange={(e) => setProposalName(e.target.value)}
              placeholder="e.g. Summer 2026 Outdoor Advertising Opportunities"
            />
            <p className="text-[11px] text-muted-foreground">
              The catchy, client-facing title. Shown as the headline on the proposal cover.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="markets">Markets (comma separated)</Label>
            <Input id="markets" value={marketsRaw} onChange={(e) => setMarketsRaw(e.target.value)} placeholder="e.g. Miami FL, Tampa FL" />
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="space-y-2">
              <Label>Campaign Dates</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Input id="start" type="date" value={flightStart} onChange={(e) => setFlightStart(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground pl-1">Start date</p>
                </div>
                <div className="space-y-1">
                  <Input id="end" type="date" value={flightEnd} onChange={(e) => setFlightEnd(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground pl-1">End date</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin">Margin %</Label>
              <Input id="margin" type="number" min="0" max="100" step="1" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client logo (optional)</Label>
              <input
                ref={logoRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => logoRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" /> Choose logo
                </Button>
                {logo && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {logo.name}
                    <button type="button" onClick={() => setLogo(null)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Presentation cover image (optional)</Label>
              <input
                ref={coverRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => coverRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" /> Choose cover image
                </Button>
                {cover && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {cover.name}
                    <button type="button" onClick={() => setCover(null)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Hero image for the proposal cover. Different from the client logo.
              </p>
            </div>
          </div>
        </section>

        <section className="surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading">Vendors</h3>
              <p className="text-[12px] text-muted-foreground">
                Add one card per vendor. Excel up to 50 MB, photo sheet PDF up to 500 MB. Max {MAX_VENDORS} vendors.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{vendors.length} / {MAX_VENDORS}</span>
          </div>

          <div className="space-y-3">
            {vendors.map((v, idx) => (
              <VendorCard
                key={v.id}
                index={idx}
                vendor={v}
                onChange={(patch) => updateVendor(v.id, patch)}
                onRemove={() => removeVendor(v.id)}
                toastFn={toast}
              />
            ))}
          </div>

          {vendors.length < MAX_VENDORS && (
            <Button type="button" variant="outline" size="sm" onClick={addVendor}>
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">
          {progress && (
            <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {progress}
            </span>
          )}
          <Button type="button" variant="ghost" asChild disabled={submitting}>
            <Link to="/">Cancel</Link>
          </Button>
          <Button type="submit" size="lg" disabled={submitting} className="bg-gradient-hero shadow-elev-md">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Create & upload
          </Button>
        </div>
      </form>
    </main>
  );
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function VendorCard({
  index,
  vendor,
  onChange,
  onRemove,
  toastFn,
}: {
  index: number;
  vendor: Vendor;
  onChange: (patch: Partial<Vendor>) => void;
  onRemove: () => void;
  toastFn: ReturnType<typeof useToast>["toast"];
}) {
  const xlsxRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative rounded-lg border bg-card/40 p-4">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Remove vendor"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Vendor {index + 1}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_1fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`vname-${vendor.id}`} className="text-xs">Vendor Name *</Label>
          <Input
            id={`vname-${vendor.id}`}
            value={vendor.vendor_name}
            onChange={(e) => onChange({ vendor_name: e.target.value })}
            placeholder="e.g. Lamar"
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <FileSpreadsheet className="h-3 w-3" /> Vendor Excel(s) (.xlsx)
          </Label>
          <input
            ref={xlsxRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              const accepted: File[] = [];
              for (const f of picked) {
                if (!/\.xlsx$/i.test(f.name)) {
                  toastFn({ title: `${f.name}: must be .xlsx`, variant: "destructive" });
                  continue;
                }
                if (f.size > MAX_EXCEL_BYTES) {
                  toastFn({ title: `${f.name} too large`, description: "Max 50 MB.", variant: "destructive" });
                  continue;
                }
                accepted.push(f);
              }
              if (accepted.length) {
                onChange({ excel_files: [...vendor.excel_files, ...accepted] });
              }
              if (xlsxRef.current) xlsxRef.current.value = "";
            }}
          />
          <MultiFilePicker
            files={vendor.excel_files}
            onPick={() => xlsxRef.current?.click()}
            onRemove={(idx) =>
              onChange({ excel_files: vendor.excel_files.filter((_, i) => i !== idx) })
            }
            placeholder="Add .xlsx files"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Photo Sheet PDF(s)
          </Label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              const accepted: File[] = [];
              for (const f of picked) {
                if (!/\.pdf$/i.test(f.name)) {
                  toastFn({ title: `${f.name}: must be PDF`, variant: "destructive" });
                  continue;
                }
                if (f.size > MAX_PDF_BYTES) {
                  toastFn({ title: `${f.name} too large`, description: "Max 500 MB.", variant: "destructive" });
                  continue;
                }
                accepted.push(f);
              }
              if (accepted.length) {
                onChange({ photo_pdfs: [...vendor.photo_pdfs, ...accepted] });
              }
              if (pdfRef.current) pdfRef.current.value = "";
            }}
          />
          <MultiFilePicker
            files={vendor.photo_pdfs}
            onPick={() => pdfRef.current?.click()}
            onRemove={(idx) =>
              onChange({ photo_pdfs: vendor.photo_pdfs.filter((_, i) => i !== idx) })
            }
            placeholder="Add PDF files (optional)"
          />
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MultiFilePicker({
  files,
  onPick,
  onRemove,
  placeholder,
}: {
  files: File[];
  onPick: () => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onPick} className="h-9">
        <Upload className="h-3.5 w-3.5" /> {files.length ? "Add another" : "Choose"}
      </Button>
      {files.length === 0 ? (
        <p className="truncate text-xs text-muted-foreground">{placeholder}</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1 text-xs"
            >
              <span className="truncate flex-1" title={f.name}>{f.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
