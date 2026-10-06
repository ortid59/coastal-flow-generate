import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin } from "lucide-react";
import { pdfFirstPageToPng } from "@/lib/pdfFirstPage";

type Props = {
  campaignId: string;
  unitId: string;
  unitNumber: string;
  onUploaded: () => void;
};

export function UnitMapUpload({ campaignId, unitId, unitNumber, onUploaded }: Props) {
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
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 10 MB per map image.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Media owners often send the unit map as a one-page PDF. Render page 1
      // to PNG so it stores and prints like any other map image.
      const isPdf = /\.pdf$/i.test(file.name);
      const body: Blob = isPdf ? await pdfFirstPageToPng(file) : file;
      const ext = isPdf ? "png" : (file.name.split(".").pop()?.toLowerCase() || "jpg");
      const path = `${campaignId}/${unitId}/map-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("minimaps").upload(path, body, { upsert: true });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("minimaps").getPublicUrl(path);

      const { error: updErr } = await supabase
        .from("units")
        .update({ inset_map_url: pub.publicUrl })
        .eq("id", unitId);
      if (updErr) throw updErr;

      toast({ title: `Map updated for ${unitNumber}` });
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
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        Replace map
      </Button>
    </>
  );
}
