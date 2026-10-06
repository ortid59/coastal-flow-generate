import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import { pdfFirstPageToPng } from "@/lib/pdfFirstPage";

type Props = {
  campaignId: string;
  unitId: string;
  unitNumber: string;
  onUploaded: () => void;
};

async function getImageWidth(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth || 0);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    img.src = url;
  });
}

export function UnitPhotoUpload({ campaignId, unitId, unitNumber, onUploaded }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(jpe?g|png|webp|pdf)$/i.test(file.name)) {
      toast({ title: "Unsupported file", description: "JPG, PNG, WEBP, or PDF.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 20 MB per photo.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // A photo supplied as a one-page PDF is rendered to PNG first so it
      // stores, signs and prints exactly like a JPG would.
      const isPdf = /\.pdf$/i.test(file.name);
      const body: Blob = isPdf ? await pdfFirstPageToPng(file) : file;
      const safe = file.name.replace(/\.pdf$/i, ".png").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${campaignId}/manual/${unitId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("photos").upload(path, body, { upsert: true });
      if (up.error) throw up.error;

      // Sign for 1 year
      const signed = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Couldn't sign URL");

      const width = await getImageWidth(body);
      const lowRes = width > 0 && width < 800;

      const { error: updErr } = await supabase
        .from("units")
        .update({
          billboard_photo_url: signed.data.signedUrl,
          low_res_flag: lowRes,
        })
        .eq("id", unitId);
      if (updErr) throw updErr;

      toast({ title: `Photo updated for ${unitNumber}`, description: lowRes ? "Marked low-res — under 800px wide." : undefined });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={onFile}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Replace photo
      </Button>
    </>
  );
}
