import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Loader2, Check, X, Sparkles } from "lucide-react";

type Props = {
  unitId: string;
  initial: string | null | undefined;
  onSaved?: (next: string) => void;
};

export function HighlightsEditor({ unitId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = !text || !text.trim();

  const save = async () => {
    setSaving(true);
    const next = text.trim();
    const { error } = await supabase
      .from("units")
      .update({ highlights: next || null })
      .eq("id", unitId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save highlights", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    onSaved?.(next);
    toast({ title: "Highlights saved" });
  };

  if (editing) {
    return (
      <div className="rounded-md border border-[hsl(var(--accent-gold)/0.4)] bg-[hsl(var(--accent-gold)/0.05)] p-3 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Describe the location's appeal — visibility, audience, cross-streets…"
          className="resize-y bg-card"
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(initial ?? "");
              setEditing(false);
            }}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/highlights rounded-md border border-border bg-muted/30 p-3 relative">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-[hsl(var(--accent-gold))]" />
        {empty ? (
          <p className="text-sm italic text-muted-foreground">
            No highlights extracted — click to add manually.
          </p>
        ) : (
          <p className="text-sm text-foreground leading-relaxed pr-8">{text}</p>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute top-1.5 right-1.5 h-7 w-7 opacity-60 hover:opacity-100"
          onClick={() => setEditing(true)}
          aria-label="Edit highlights"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
