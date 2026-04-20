import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, Trash2, ShieldCheck, UserPlus } from "lucide-react";

type AllowedUser = {
  email: string;
  note: string | null;
  created_at: string | null;
};

export default function Settings() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: adm }, { data: list }] = await Promise.all([
      supabase.rpc("is_allowed_admin"),
      supabase.from("allowed_users").select("email, note, created_at").order("created_at", { ascending: true }),
    ]);
    setIsAdmin(!!adm);
    setUsers((list ?? []) as AllowedUser[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    const { error } = await supabase.rpc("admin_add_allowed_user", {
      _email: email.trim(),
      _note: note.trim() || null,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Couldn't add user", description: error.message, variant: "destructive" });
      return;
    }
    setEmail("");
    setNote("");
    toast({ title: "Added to allowlist" });
    load();
  };

  const remove = async (em: string) => {
    if (!confirm(`Remove ${em} from the allowlist?`)) return;
    const { error } = await supabase.rpc("admin_remove_allowed_user", { _email: em });
    if (error) {
      toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed" });
    load();
  };

  return (
    <main className="container-app py-10 md:py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading">Team access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only emails on this list can sign in. Public signups are disabled.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !isAdmin ? (
        <div className="surface-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Your account isn't authorized to manage the allowlist.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="surface-card overflow-hidden">
            <div className="border-b bg-muted/30 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Allowed emails ({users.length})
            </div>
            {users.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No users yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {users.map((u) => (
                  <li key={u.email} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.email}</div>
                      {u.note && <div className="truncate text-xs text-muted-foreground">{u.note}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(u.email)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="surface-card p-5">
            <h3 className="font-heading flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" /> Invite teammate
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              They'll be able to request a magic-link sign-in immediately.
            </p>
            <form onSubmit={add} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="al-email">Email</Label>
                <Input
                  id="al-email"
                  type="email"
                  required
                  placeholder="teammate@coastalmaverick.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-note">Note (optional)</Label>
                <Input
                  id="al-note"
                  placeholder="e.g. Heather, Account Director"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add to allowlist
              </Button>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}
