import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
  RefreshCw,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaignId: string;
  onDone: () => void;
};

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_");

/**
 * Re-upload one or more vendor files (Excel quotes, photo sheets PDF, or
 * billboard photos) for an existing campaign and re-trigger the matching
 * extraction edge functions.
 */
export function ReuploadFilesDialog({ open, onOpenChange, campaignId, onDone }: Props) {
  const { toast } = useToast();
  const [excels, setExcels] = useState<File[]>([]);
  const [photoSheets, setPhotoSheets] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const xlsxRef = useRef<HTMLInputElement>(null);
  const psRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setExcels([]);
    setPhotoSheets(null);
    setPhotos([]);
    setStep("");
  };

  const submit = async () => {
    if (!excels.length && !photoSheets && !photos.length) {
      toast({
        title: "Nothing to upload",
        description: "Pick at least one file to re-upload.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const records: Array<{
        kind: "excel" | "pdf" | "image" | "photosheets";
        storage_path: string;
        original_name: string;
      }> = [];

      // Excels — append (don't replace existing) so additional units can be merged on re-parse
      for (const f of excels) {
        setStep(`Uploading Excel — ${f.name}`);
        const path = `${campaignId}/excel/${Date.now()}-${safeName(f.name)}`;
        const up = await supabase.storage.from("uploads").upload(path, f, { upsert: false });
        if (up.error) throw up.error;
        records.push({ kind: "excel", storage_path: path, original_name: f.name });
      }

      // Photo sheets — single file at fixed path; upsert replaces it
      if (photoSheets) {
        setStep(`Uploading photo sheet — ${photoSheets.name}`);
        const psPath = `${campaignId}/photosheets.pdf`;
        const up = await supabase.storage
          .from("uploads")
          .upload(psPath, photoSheets, { upsert: true });
        if (up.error) throw up.error;
        records.push({
          kind: "photosheets",
          storage_path: psPath,
          original_name: photoSheets.name,
        });
      }

      // Photos / extra PDFs
      for (const f of photos) {
        setStep(`Uploading photo — ${f.name}`);
        const isPdf = /\.pdf$/i.test(f.name);
        const folder = isPdf ? "pdf" : "image";
        const path = `${campaignId}/${folder}/${Date.now()}-${safeName(f.name)}`;
        const up = await supabase.storage.from("uploads").upload(path, f, { upsert: false });
        if (up.error) throw up.error;
        records.push({
          kind: isPdf ? "pdf" : "image",
          storage_path: path,
          original_name: f.name,
        });
      }

      if (records.length) {
        setStep("Saving file records…");
        // Avoid duplicate vendor_files rows for fixed-path re-uploads (e.g. photosheets).
        // Delete any prior row pointing at the exact same storage_path before inserting.
        const fixedPaths = records.map((r) => r.storage_path);
        await supabase
          .from("vendor_files")
          .delete()
          .eq("campaign_id", campaignId)
          .in("storage_path", fixedPaths);
        const { error: vfErr } = await supabase
          .from("vendor_files")
          .insert(records.map((r) => ({ campaign_id: campaignId, ...r })));
        if (vfErr) throw vfErr;
      }

      // Re-trigger extractions in the background based on what was uploaded
      const promises: Promise<unknown>[] = [];
      if (excels.length) {
        setStep("Re-parsing Excel quotes…");
        promises.push(
          supabase.functions.invoke("parse-excel", { body: { campaign_id: campaignId } }),
        );
      }
      if (photoSheets) {
        setStep("Re-extracting highlights & maps…");
        promises.push(
          supabase.functions.invoke("extract-highlights", { body: { campaign_id: campaignId } }),
        );
      }
      if (photos.length || photoSheets) {
        promises.push(
          supabase.functions.invoke("extract-photos", { body: { campaign_id: campaignId } }),
        );
      }
      // Don't block UI on edge functions finishing — let them run async
      Promise.allSettled(promises).then(() => onDone());

      toast({
        title: "Re-upload started",
        description: "We'll re-parse and re-extract in the background.",
      });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({
        title: "Re-upload failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-[hsl(var(--accent-gold))]" /> Re-upload vendor files
          </DialogTitle>
          <DialogDescription>
            Upload new files to re-parse quotes, re-extract highlights, or replace billboard
            photos. Existing units are kept and updated where possible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Excel */}
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
            <Label className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-[hsl(var(--ocean))]" />
              Vendor Excel quotes (.xlsx)
            </Label>
            <input
              ref={xlsxRef}
              type="file"
              accept=".xlsx"
              multiple
              hidden
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setExcels((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => xlsxRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" /> Choose Excel files
            </Button>
            <FileChips files={excels} onRemove={(i) => setExcels(excels.filter((_, x) => x !== i))} />
          </div>

          {/* Photo sheets PDF */}
          <div className="space-y-2 rounded-md border border-[hsl(var(--accent-gold)/0.4)] bg-[hsl(var(--accent-gold)/0.04)] p-4">
            <Label className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-[hsl(var(--accent-gold))]" />
              Vendor Photo Sheets PDF
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Used to extract highlights, maps, and structured details for each unit.
            </p>
            <input
              ref={psRef}
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={(e) => setPhotoSheets(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => psRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" /> {photoSheets ? "Replace PDF" : "Choose PDF"}
            </Button>
            {photoSheets && <FileChips files={[photoSheets]} onRemove={() => setPhotoSheets(null)} />}
          </div>

          {/* Photos */}
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
            <Label className="flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-[hsl(var(--ocean))]" />
              Billboard photos / photo PDFs
            </Label>
            <input
              ref={photosRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              hidden
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setPhotos((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => photosRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" /> Choose photos
            </Button>
            <FileChips files={photos} onRemove={(i) => setPhotos(photos.filter((_, x) => x !== i))} />
          </div>

          {step && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {step}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload & re-extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileChips({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span
          key={`${f.name}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-2 py-0.5 text-[11px] text-foreground"
        >
          {f.name}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${f.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
