import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  initial: {
    client_name: string;
    campaign_name: string;
    markets: string[] | null;
    flight_start: string | null;
    flight_end: string | null;
    margin_pct: number | null;
  };
  onSaved: () => void;
};

export function EditCampaignDialog({ open, onOpenChange, campaignId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [clientName, setClientName] = useState(initial.client_name);
  const [campaignName, setCampaignName] = useState(initial.campaign_name);
  const [marketsRaw, setMarketsRaw] = useState((initial.markets ?? []).join(", "));
  const [flightStart, setFlightStart] = useState(initial.flight_start ?? "");
  const [flightEnd, setFlightEnd] = useState(initial.flight_end ?? "");
  const [marginPct, setMarginPct] = useState(String(initial.margin_pct ?? 20));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setClientName(initial.client_name);
      setCampaignName(initial.campaign_name);
      setMarketsRaw((initial.markets ?? []).join(", "));
      setFlightStart(initial.flight_start ?? "");
      setFlightEnd(initial.flight_end ?? "");
      setMarginPct(String(initial.margin_pct ?? 20));
    }
  }, [open, initial]);

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
        markets: markets.length ? markets : null,
        flight_start: flightStart || null,
        flight_end: flightEnd || null,
        margin_pct: marginPct ? Number(marginPct) : 20,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>Update client, dates, and markets.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-client">Client</Label>
              <Input id="e-client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-campaign">Campaign</Label>
              <Input id="e-campaign" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-markets">Markets (comma separated)</Label>
            <Input id="e-markets" value={marketsRaw} onChange={(e) => setMarketsRaw(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="e-start">Flight start</Label>
              <Input id="e-start" type="date" value={flightStart} onChange={(e) => setFlightStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-end">Flight end</Label>
              <Input id="e-end" type="date" value={flightEnd} onChange={(e) => setFlightEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-margin">Margin %</Label>
              <Input id="e-margin" type="number" min="0" max="100" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
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
