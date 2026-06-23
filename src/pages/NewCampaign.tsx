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
  excel_file: File | null;
  photo_pdf: File | null;
};

const MAX_VENDORS = 25;
const MAX_EXCEL_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PDF_BYTES = 500 * 1024 * 1024; // 500 MB

const newVendor = (): Vendor => ({
  id: crypto.randomUUID(),
  vendor_name: "",
  excel_file: null,
  photo_pdf: null,
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
      .filter((v) => v.vendor_name || v.excel_file || v.photo_pdf);

    if (cleaned.length === 0) {
      toast({ title: "Add at least one vendor", variant: "destructive" });
      return;
    }
    for (const v of cleaned) {
      if (!v.vendor_name) {
        toast({ title: "Vendor name is required", description: "Every vendor card needs a name.", variant: "destructive" });
        return;
      }
      if (!v.excel_file) {
        toast({ title: `${v.vendor_name}: Excel required`, description: "Each vendor needs a .xlsx file.", variant: "destructive" });
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
      const totalFiles = cleaned.reduce((n, v) => n + 1 + (v.photo_pdf ? 1 : 0), 0);
      let done = 0;
      const records: Array<{
        kind: "excel" | "photosheets";
        storage_path: string;
        original_name: string;
        vendor: string;
      }> = [];

      for (const v of cleaned) {
        // Excel
        done += 1;
        setProgress(`Uploading file ${done}/${totalFiles} — ${v.excel_file!.name}`);
        const xPath = `${campaignId}/excel/${Date.now()}-${safeName(v.vendor_name)}-${safeName(v.excel_file!.name)}`;
        const xUp = await supabase.storage.from("uploads").upload(xPath, v.excel_file!, { upsert: false });
        if (xUp.error) throw xUp.error;
        records.push({ kind: "excel", storage_path: xPath, original_name: v.excel_file!.name, vendor: v.vendor_name });

        // Photo PDF
        if (v.photo_pdf) {
          done += 1;
          setProgress(`Uploading file ${done}/${totalFiles} — ${v.photo_pdf.name}`);
          const pPath = `${campaignId}/photosheets/${Date.now()}-${safeName(v.vendor_name)}-${safeName(v.photo_pdf.name)}`;
          const pUp = await supabase.storage.from("uploads").upload(pPath, v.photo_pdf, { upsert: false });
          if (pUp.error) throw pUp.error;
          records.push({ kind: "photosheets", storage_path: pPath, original_name: v.photo_pdf.name, vendor: v.vendor_name });
        }
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
        .then(({ error }) => {
          if (error) {
            console.error("parse-excel invoke error", error);
            return;
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
            <FileSpreadsheet className="h-3 w-3" /> Vendor Excel (.xlsx) *
          </Label>
          <input
            ref={xlsxRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (!f) return;
              if (!/\.xlsx$/i.test(f.name)) {
                toastFn({ title: "Excel must be .xlsx", variant: "destructive" });
                return;
              }
              if (f.size > MAX_EXCEL_BYTES) {
                toastFn({ title: `${f.name} too large`, description: "Max 50 MB.", variant: "destructive" });
                return;
              }
              onChange({ excel_file: f });
            }}
          />
          <FilePickerRow
            file={vendor.excel_file}
            onPick={() => xlsxRef.current?.click()}
            onClear={() => onChange({ excel_file: null })}
            placeholder="Choose .xlsx"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Photo Sheet PDF
          </Label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (!f) return;
              if (!/\.pdf$/i.test(f.name)) {
                toastFn({ title: "Photo sheet must be PDF", variant: "destructive" });
                return;
              }
              if (f.size > MAX_PDF_BYTES) {
                toastFn({ title: `${f.name} too large`, description: "Max 500 MB.", variant: "destructive" });
                return;
              }
              onChange({ photo_pdf: f });
            }}
          />
          <FilePickerRow
            file={vendor.photo_pdf}
            onPick={() => pdfRef.current?.click()}
            onClear={() => onChange({ photo_pdf: null })}
            placeholder="Choose PDF (optional)"
          />
        </div>
      </div>
    </div>
  );
}

function FilePickerRow({
  file,
  onPick,
  onClear,
  placeholder,
}: {
  file: File | null;
  onPick: () => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onPick} className="h-9 shrink-0">
        <Upload className="h-3.5 w-3.5" /> {file ? "Replace" : "Choose"}
      </Button>
      {file ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={onClear} className="shrink-0 text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <span className="truncate text-xs text-muted-foreground">{placeholder}</span>
      )}
    </div>
  );
}
