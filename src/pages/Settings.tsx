import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  UserPlus,
  Save,
  FileText,
} from "lucide-react";
import {
  DEFAULT_PROPOSAL_SETTINGS,
  DEFAULT_TEAM_MEMBERS,
  ProposalSettings,
  TeamMember,
  fetchProposalSettings,
  invalidateProposalSettings,
} from "@/hooks/useProposalSettings";


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
      supabase
        .from("allowed_users")
        .select("email, note, created_at")
        .order("created_at", { ascending: true }),
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
          <h1 className="font-heading">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team access and proposal content.
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
            Your account isn't authorized to manage settings.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="team" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="team">
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Team Access
            </TabsTrigger>
            <TabsTrigger value="proposal">
              <FileText className="h-4 w-4 mr-1.5" />
              Proposal Content
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <section className="surface-card overflow-hidden">
                <div className="border-b bg-muted/30 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Allowed emails ({users.length})
                </div>
                {users.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No users yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {users.map((u) => (
                      <li
                        key={u.email}
                        className="flex items-center justify-between gap-4 px-5 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.email}</div>
                          {u.note && (
                            <div className="truncate text-xs text-muted-foreground">{u.note}</div>
                          )}
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
          </TabsContent>

          <TabsContent value="proposal">
            <ProposalContentForm />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function ProposalContentForm() {
  const { toast } = useToast();
  const [data, setData] = useState<ProposalSettings>(DEFAULT_PROPOSAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await fetchProposalSettings();
      setData(s);
      setLoading(false);
    })();
  }, []);

  const set = (k: keyof ProposalSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((d) => ({ ...d, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await (supabase as any)
      .from("proposal_settings")
      .upsert(
        {
          id: 1,
          company_name: data.company_name,
          company_email: data.company_email,
          company_phone: data.company_phone,
          who_we_are_heading: data.who_we_are_heading,
          who_we_are_body_1: data.who_we_are_body_1,
          who_we_are_body_2: data.who_we_are_body_2,
          meet_the_team_heading: data.meet_the_team_heading,
          next_steps_heading: data.next_steps_heading,
          next_steps_body: data.next_steps_body,
          footer_tagline: data.footer_tagline,
          team_members: data.team_members ?? [],
        },
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    invalidateProposalSettings();
    toast({ title: "Proposal content saved" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-8 max-w-3xl">
      <Section title="Company Info" description="Used in the proposal footer and contact block.">
        <Field label="Company Name">
          <Input value={data.company_name} onChange={set("company_name")} />
        </Field>
        <Field label="Business Email">
          <Input type="email" value={data.company_email} onChange={set("company_email")} placeholder="hello@coastalmaverick.com" />
        </Field>
        <Field label="Phone">
          <Input value={data.company_phone} onChange={set("company_phone")} placeholder="(555) 123-4567" />
        </Field>
      </Section>

      <Section title="Who We Are Page">
        <Field label="Heading">
          <Input value={data.who_we_are_heading} onChange={set("who_we_are_heading")} />
        </Field>
        <Field label="Paragraph 1">
          <Textarea rows={6} value={data.who_we_are_body_1} onChange={set("who_we_are_body_1")} />
        </Field>
        <Field label="Paragraph 2">
          <Textarea rows={6} value={data.who_we_are_body_2} onChange={set("who_we_are_body_2")} />
        </Field>
      </Section>

      <Section title="Meet the Team" description="Roster shown on the client proposal. Members without a photo get an initials monogram.">
        <Field label="Section Heading">
          <Input value={data.meet_the_team_heading} onChange={set("meet_the_team_heading")} />
        </Field>
        <TeamEditor
          value={data.team_members?.length ? data.team_members : DEFAULT_TEAM_MEMBERS}
          onChange={(members) => setData((d) => ({ ...d, team_members: members }))}
        />
      </Section>


      <Section title="Next Steps">
        <Field label="Heading">
          <Input value={data.next_steps_heading} onChange={set("next_steps_heading")} />
        </Field>
        <Field label="Body text">
          <Textarea rows={6} value={data.next_steps_body} onChange={set("next_steps_body")} placeholder="Optional intro paragraph shown above the four steps." />
        </Field>
      </Section>

      <Section title="Footer">
        <Field label="Footer tagline / closing text">
          <Textarea rows={3} value={data.footer_tagline} onChange={set("footer_tagline")} placeholder="Optional line shown under the footer." />
        </Field>
      </Section>

      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-6">
      <h2 className="font-heading text-base">{title}</h2>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
