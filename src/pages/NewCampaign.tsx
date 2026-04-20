import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";

type Picked = { file: File };

const MAX_FILES = 10;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file

export default function NewCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [clientName, setClientName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [marketsRaw, setMarketsRaw] = useState("");
  const [flightStart, setFlightStart] = useState("");
  const [flightEnd, setFlightEnd] = useState("");
  const [marginPct, setMarginPct] = useState("20");

  const [excels, setExcels] = useState<Picked[]>([]);
  const [pdfs, setPdfs] = useState<Picked[]>([]);
  const [logo, setLogo] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const xlsxRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const addFiles = (
    list: FileList | null,
    setter: (p: Picked[]) => void,
    current: Picked[],
    accept: (name: string) => boolean,
    label: string,
  ) => {
    if (!list) return;
    const incoming = Array.from(list)
      .filter((f) => accept(f.name.toLowerCase()))
      .filter((f) => {
        if (f.size > MAX_BYTES) {
          toast({ title: `${f.name} is too large`, description: "Max 50 MB per file.", variant: "destructive" });
          return false;
        }
        return true;
      })
      .map((file) => ({ file }));
    const next = [...current, ...incoming].slice(0, MAX_FILES);
    if (current.length + incoming.length > MAX_FILES) {
      toast({ title: `Limit ${MAX_FILES} ${label} files`, description: "Extra files were ignored." });
    }
    setter(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!clientName.trim() || !campaignName.trim()) {
      toast({ title: "Missing details", description: "Client and campaign name are required.", variant: "destructive" });
      return;
    }
    if (excels.length === 0) {
      toast({ title: "Add at least one Excel", description: "Vendor RFP Template (.xlsx).", variant: "destructive" });
      return;
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

      // Upload logo (public bucket)
      let logoUrl: string | null = null;
      if (logo) {
        setProgress("Uploading logo…");
        const path = `${campaignId}/${Date.now()}-${safeName(logo.name)}`;
        const up = await supabase.storage.from("logos").upload(path, logo, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = pub.publicUrl;
        await supabase.from("campaigns").update({ client_logo_url: logoUrl }).eq("id", campaignId);
      }

      // Upload xlsx + pdf to private uploads bucket
      const total = excels.length + pdfs.length;
      let done = 0;
      const records: Array<{ kind: "excel" | "pdf"; storage_path: string; original_name: string }> = [];

      for (const { file } of excels) {
        done += 1;
        setProgress(`Uploading file ${done}/${total} — ${file.name}`);
        const path = `${campaignId}/excel/${Date.now()}-${safeName(file.name)}`;
        const up = await supabase.storage.from("uploads").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        records.push({ kind: "excel", storage_path: path, original_name: file.name });
      }
      for (const { file } of pdfs) {
        done += 1;
        setProgress(`Uploading file ${done}/${total} — ${file.name}`);
        const path = `${campaignId}/pdf/${Date.now()}-${safeName(file.name)}`;
        const up = await supabase.storage.from("uploads").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        records.push({ kind: "pdf", storage_path: path, original_name: file.name });
      }

      if (records.length) {
        setProgress("Saving file records…");
        const { error: vfErr } = await supabase.from("vendor_files").insert(
          records.map((r) => ({ campaign_id: campaignId, ...r })),
        );
        if (vfErr) throw vfErr;
      }

      toast({ title: "Campaign created", description: "Parsing vendor Excel…" });
      // Fire and forget — Review screen will poll status
      supabase.functions
        .invoke("parse-excel", { body: { campaign_id: campaignId } })
        .then(({ error }) => {
          if (error) console.error("parse-excel invoke error", error);
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
          Upload vendor Excels and photo PDFs. We'll parse them on the next step.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <section className="surface-card p-6 lg:col-span-2 space-y-5">
          <h3 className="font-heading">Campaign details</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client">Client name *</Label>
              <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Stone Climbing JAX" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign name *</Label>
              <Input id="campaign" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Spring 2026 Launch" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="markets">Markets (comma separated)</Label>
            <Input id="markets" value={marketsRaw} onChange={(e) => setMarketsRaw(e.target.value)} placeholder="Jacksonville FL, Orlando FL" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="start">Flight start</Label>
              <Input id="start" type="date" value={flightStart} onChange={(e) => setFlightStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">Flight end</Label>
              <Input id="end" type="date" value={flightEnd} onChange={(e) => setFlightEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin">Margin %</Label>
              <Input id="margin" type="number" min="0" max="100" step="1" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
          </div>

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
        </section>

        <aside className="space-y-6">
          <FileDropZone
            title="Vendor Excels"
            hint="Up to 10 .xlsx files (Clear Channel / OutFront RFP Template)"
            icon={<FileSpreadsheet className="h-5 w-5" />}
            inputRef={xlsxRef}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            files={excels}
            onAdd={(fl) => addFiles(fl, setExcels, excels, (n) => n.endsWith(".xlsx"), "Excel")}
            onRemove={(i) => setExcels(excels.filter((_, idx) => idx !== i))}
          />
          <FileDropZone
            title="Vendor photo PDFs"
            hint="Up to 10 .pdf files"
            icon={<FileText className="h-5 w-5" />}
            inputRef={pdfRef}
            accept=".pdf,application/pdf"
            files={pdfs}
            onAdd={(fl) => addFiles(fl, setPdfs, pdfs, (n) => n.endsWith(".pdf"), "PDF")}
            onRemove={(i) => setPdfs(pdfs.filter((_, idx) => idx !== i))}
          />
        </aside>

        <div className="lg:col-span-3 flex flex-wrap items-center justify-end gap-3 border-t pt-6">
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

function FileDropZone({
  title,
  hint,
  icon,
  accept,
  files,
  inputRef,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  accept: string;
  files: Picked[];
  inputRef: React.RefObject<HTMLInputElement>;
  onAdd: (fl: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          {icon}
        </div>
        <div>
          <h4 className="font-heading text-base">{title}</h4>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => onAdd(e.target.files)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onAdd(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-6 text-sm transition-colors ${
          drag ? "border-primary bg-secondary/40" : "border-border hover:border-primary/40 hover:bg-muted/40"
        }`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium text-foreground">Click or drag files here</span>
        <span className="text-xs text-muted-foreground">{files.length} / {MAX_FILES} added</span>
      </button>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 text-xs">
              <span className="truncate">{f.file.name}</span>
              <button type="button" onClick={() => onRemove(i)} className="ml-2 text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
