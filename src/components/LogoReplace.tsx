import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Image as ImageIcon } from "lucide-react";

type Props = {
  campaignId: string;
  currentUrl: string | null;
  clientName: string;
  onUploaded: (url: string) => void;
};

const MAX_BYTES = 2 * 1024 * 1024;

export function LogoReplace({ campaignId, currentUrl, clientName, onUploaded }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(png|jpe?g|svg|webp)$/i.test(file.name)) {
      toast({ title: "Unsupported file", description: "PNG, JPG, SVG, or WEBP only.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Too large", description: "Max 2 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${campaignId}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("campaigns")
        .update({ client_logo_url: url })
        .eq("id", campaignId);
      if (updErr) throw updErr;
      onUploaded(url);
      toast({ title: "Logo updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border bg-card">
        {currentUrl ? (
          <img src={currentUrl} alt={`${clientName} logo`} className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
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
          {currentUrl ? "Replace logo" : "Upload logo"}
        </Button>
        <p className="mt-1 text-[11px] text-muted-foreground">PNG / JPG / SVG · max 2 MB</p>
      </div>
    </div>
  );
}
