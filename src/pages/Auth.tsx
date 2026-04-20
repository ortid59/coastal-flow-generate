import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      const from = (location.state as { from?: string } | null)?.from || "/";
      navigate(from, { replace: true });
    }
  }, [session, loading, navigate, location.state]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });
    setSending(false);

    if (error) {
      // Allowlist trigger raises a clear message — surface it cleanly.
      const msg = /allowlist/i.test(error.message)
        ? "This email isn't on the Coastal Maverick allowlist. Contact Heather to request access."
        : error.message;
      toast({ title: "Couldn't send sign-in link", description: msg, variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: "Check your email", description: "We sent you a magic sign-in link." });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative background */}
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
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-gold text-primary shadow-elev-md">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-primary-foreground">
              Coastal Maverick
            </h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              Sign in to the Proposal Generator
            </p>
          </div>

          <div className="surface-card p-7">
            {sent ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Mail className="h-6 w-6" />
                </div>
                <h2 className="font-heading text-xl font-semibold">Magic link sent</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Open <span className="font-medium text-foreground">{email}</span> and click the link to sign in.
                </p>
                <Button variant="ghost" className="mt-6" onClick={() => setSent(false)}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@coastalmaverick.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={sending}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sending || !email}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send magic link"}
                </Button>
                <p className="pt-2 text-center text-xs text-muted-foreground">
                  Access is restricted to the Coastal Maverick team.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
