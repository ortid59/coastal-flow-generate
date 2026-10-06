import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import { PHOTO_ACCEPT, uploadUnitPhoto } from "@/lib/unitPhoto";

type Props = {
  campaignId: string;
  unitId: string;
  unitNumber: string;
  onUploaded: () => void;
};

export function UnitPhotoUpload({ campaignId, unitId, unitNumber, onUploaded }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      // Same code path the drag-and-drop handler uses, so a dropped file and a
      // picked file behave identically (PDF conversion, low-res flag, signing).
      const { lowRes } = await uploadUnitPhoto(campaignId, unitId, file);
      toast({
        title: `Photo updated for ${unitNumber}`,
        description: lowRes ? "Marked low-res — under 800px wide." : undefined,
      });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} className="hidden" onChange={onFile} />
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
