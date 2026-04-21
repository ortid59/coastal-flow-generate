import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, Lock } from "lucide-react";
import Portal from "./Portal";
import { Logo } from "@/components/Logo";

const sessionKey = (token: string) => `portal:${token}`;

export default function PortalGate() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    if (!token) return;
    const cached = sessionStorage.getItem(sessionKey(token));
    if (cached) {
      setCampaignId(cached);
    }
    setBootstrapping(false);
  }, [token]);

  if (!token) return <Navigate to="/" replace />;

  if (campaignId) {
    return <Portal token={token} campaignId={campaignId} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_portal_password", {
      _token: token,
      _password: password,
    });
    setVerifying(false);
    if (error) {
      toast({ title: "Couldn't verify", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      toast({ title: "Incorrect password", description: "Double-check the password from your account team.", variant: "destructive" });
      return;
    }
    sessionStorage.setItem(sessionKey(token), data as string);
    setCampaignId(data as string);
  };

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div
        className="absolute inset-0 opacity-30"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, hsl(var(--accent-gold) / 0.25), transparent 40%), radial-gradient(circle at 80% 80%, hsl(var(--secondary) / 0.3), transparent 50%)",
        }}
      />
      <main className="relative grid min-h-screen place-items-center px-6 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 inline-flex rounded-2xl bg-card/95 px-6 py-4 shadow-elev-lg backdrop-blur">
              <Logo size={80} />
            </div>
            <h1 className="font-heading text-2xl font-bold text-primary-foreground inline-flex items-center gap-2 justify-center">
              <Lock className="h-5 w-5" /> Private proposal
            </h1>
            <p className="mt-2 text-sm text-primary-foreground/80">
              Enter the password your account team shared with you.
            </p>
          </div>
          <div className="surface-card p-7">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pwd" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Password
                </Label>
                <Input
                  id="pwd"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={verifying}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={verifying || !password}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "View proposal"}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
