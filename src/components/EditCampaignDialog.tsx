import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Image as ImageIcon, Upload, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  initial: {
    client_name: string;
    campaign_name: string;
    proposal_name?: string | null;
    markets: string[] | null;
    flight_start: string | null;
    flight_end: string | null;
    margin_pct: number | null;
    client_logo_url?: string | null;
    cover_image_url?: string | null;
    canva_design_url?: string | null;
    status?: string | null;
    campaign_date?: string | null;
  };
  onSaved: () => void;
};

const STATUSES = ["draft", "in_review", "approved", "live", "archived"];

export function EditCampaignDialog({ open, onOpenChange, campaignId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [clientName, setClientName] = useState(initial.client_name);
  const [campaignName, setCampaignName] = useState(initial.campaign_name);
  const [proposalName, setProposalName] = useState(initial.proposal_name ?? "");
  const [marketsRaw, setMarketsRaw] = useState((initial.markets ?? []).join(", "));
  const [flightStart, setFlightStart] = useState(initial.flight_start ?? "");
  const [flightEnd, setFlightEnd] = useState(initial.flight_end ?? "");
  const [marginPct, setMarginPct] = useState(String(initial.margin_pct ?? 20));
  const [campaignDate, setCampaignDate] = useState(initial.campaign_date ?? "");
  const [canvaUrl, setCanvaUrl] = useState(initial.canva_design_url ?? "");
  const [status, setStatus] = useState(initial.status ?? "draft");
  const [logoUrl, setLogoUrl] = useState(initial.client_logo_url ?? "");
  const [coverUrl, setCoverUrl] = useState(initial.cover_image_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setClientName(initial.client_name);
      setCampaignName(initial.campaign_name);
      setProposalName(initial.proposal_name ?? "");
      setMarketsRaw((initial.markets ?? []).join(", "));
      setFlightStart(initial.flight_start ?? "");
      setFlightEnd(initial.flight_end ?? "");
      setMarginPct(String(initial.margin_pct ?? 20));
      setCampaignDate(initial.campaign_date ?? "");
      setCanvaUrl(initial.canva_design_url ?? "");
      setStatus(initial.status ?? "draft");
      setLogoUrl(initial.client_logo_url ?? "");
      setCoverUrl(initial.cover_image_url ?? "");
    }
  }, [open, initial]);

  const uploadAsset = async (
    file: File,
    bucket: "logos",
    folder: "logo" | "cover",
    setUrl: (s: string) => void,
    setBusy: (b: boolean) => void,
    maxMB: number,
  ) => {
    if (file.size > maxMB * 1024 * 1024) {
      toast({ title: "Image too large", description: `Max ${maxMB} MB.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${campaignId}/${folder}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (up.error) {
      setBusy(false);
      toast({ title: "Upload failed", description: up.error.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    setUrl(pub.publicUrl);
    setBusy(false);
  };

  const save = async () => {
    if (!clientName.trim() || !campaignName.trim()) {
      toast({ title: "Client and campaign name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const markets = marketsRaw.split(",").map((m) => m.trim()).filter(Boolean);
    const { error } = await supabase
      .from("campaigns")
      .update({
        client_name: clientName.trim(),
        campaign_name: campaignName.trim(),
        proposal_name: proposalName.trim() || null,
        markets: markets.length ? markets : null,
        flight_start: flightStart || null,
        flight_end: flightEnd || null,
        margin_pct: marginPct ? Number(marginPct) : 20,
        campaign_date: campaignDate || null,
        canva_design_url: canvaUrl.trim() || null,
        status: status || "draft",
        client_logo_url: logoUrl || null,
        cover_image_url: coverUrl || null,
      })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>Update any campaign detail.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-client">Client name</Label>
              <Input id="e-client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-campaign">Campaign name</Label>
              <Input id="e-campaign" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-proposal">Proposal name</Label>
            <Input
              id="e-proposal"
              value={proposalName}
              onChange={(e) => setProposalName(e.target.value)}
              placeholder="Your Bridge to the Mountains — Jacksonville Advertising Opportunities"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-markets">Markets (comma separated)</Label>
            <Input id="e-markets" value={marketsRaw} onChange={(e) => setMarketsRaw(e.target.value)} placeholder="Jacksonville FL, Orlando FL" />
          </div>

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-2">
              <Label>Campaign Dates</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Input id="e-start" type="date" value={flightStart} onChange={(e) => setFlightStart(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground pl-1">Start date</p>
                </div>
                <div className="space-y-1">
                  <Input id="e-end" type="date" value={flightEnd} onChange={(e) => setFlightEnd(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground pl-1">End date</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-margin">Margin %</Label>
              <Input id="e-margin" type="number" min="0" max="100" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-cdate">Campaign date</Label>
              <Input id="e-cdate" type="date" value={campaignDate} onChange={(e) => setCampaignDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Date the campaign was created/issued.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="e-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-canva">Canva design URL</Label>
            <Input
              id="e-canva"
              value={canvaUrl}
              onChange={(e) => setCanvaUrl(e.target.value)}
              placeholder="https://www.canva.com/design/..."
            />
          </div>

          <div className="space-y-2">
            <Label>Client logo</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-secondary/40 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Client logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAsset(f, "logos", "logo", setLogoUrl, setUploadingLogo, 2);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl("")}>
                    <X className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">PNG, JPG, SVG, or WEBP. Max 2 MB.</p>
          </div>

          <div className="space-y-2">
            <Label>Presentation cover image</Label>
            <p className="text-[11px] text-muted-foreground">
              The hero photo on the first section of the proposal. If empty, the first unit's billboard
              photo is used. Different from the client logo.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-28 items-center justify-center rounded-md border bg-secondary/40 overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAsset(f, "logos", "cover", setCoverUrl, setUploadingCover, 8);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={uploadingCover}>
                  {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {coverUrl ? "Replace cover" : "Upload cover"}
                </Button>
                {coverUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCoverUrl("")}>
                    <X className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">PNG, JPG, or WEBP. Max 8 MB. Wide images work best.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
