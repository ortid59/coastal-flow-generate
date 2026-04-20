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
import { Loader2, Copy, Check, ShieldOff, Link as LinkIcon, KeyRound } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
};

export function SharePortalDialog({ open, onOpenChange, campaignId, campaignName }: Props) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [setAt, setSetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("portal_token, portal_password_hash, portal_password_set_at")
      .eq("id", campaignId)
      .single();
    setToken(data?.portal_token ?? null);
    setHasPassword(!!data?.portal_password_hash);
    setSetAt(data?.portal_password_set_at ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setPassword("");
      setCopied(false);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId]);

  const shareUrl = token ? `${window.location.origin}/p/${token}` : "";

  const savePassword = async () => {
    if (password.length < 4) {
      toast({ title: "Password too short", description: "Use at least 4 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("set_campaign_portal_password", {
      _campaign_id: campaignId,
      _password: password,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save password", description: error.message, variant: "destructive" });
      return;
    }
    setToken(data as string);
    setHasPassword(true);
    setPassword("");
    toast({ title: hasPassword ? "Password rotated" : "Share link created" });
    refresh();
  };

  const revoke = async () => {
    if (!confirm("Revoke the share link? Clients will lose access immediately.")) return;
    setRevoking(true);
    const { error } = await supabase.rpc("revoke_campaign_portal", { _campaign_id: campaignId });
    setRevoking(false);
    if (error) {
      toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" });
      return;
    }
    setToken(null);
    setHasPassword(false);
    setSetAt(null);
    toast({ title: "Share link revoked" });
  };

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" /> Share with client
          </DialogTitle>
          <DialogDescription>
            {campaignName} — generates a private link guarded by a password you set.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {hasPassword && shareUrl && (
              <div className="space-y-2">
                <Label>Shareable link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={shareUrl} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copy} title="Copy">
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {setAt && (
                  <p className="text-xs text-muted-foreground">
                    Password last set {new Date(setAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="portal-pwd" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                {hasPassword ? "Rotate password" : "Set a password"}
              </Label>
              <Input
                id="portal-pwd"
                type="text"
                placeholder="Choose a memorable password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Share this password with the client over a separate channel (e.g. text or email).
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {hasPassword && (
              <Button variant="ghost" onClick={revoke} disabled={revoking} className="text-destructive hover:text-destructive">
                {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                Revoke link
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={savePassword} disabled={saving || password.length < 4}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {hasPassword ? "Rotate" : "Create link"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
