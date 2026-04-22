import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Pencil } from "lucide-react";

type Props = {
  unitId: string;
  unitNumber: string;
  initial: string | null | undefined;
  onSaved?: (next: string) => void;
};

/**
 * Compact highlights cell: shows a 2-line preview, click to open a dialog
 * that displays the full content and lets admin edit.
 */
export function HighlightsCell({ unitId, unitNumber, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const empty = !initial || !initial.trim();

  const save = async () => {
    setSaving(true);
    const next = text.trim();
    const { error } = await supabase
      .from("units")
      .update({ highlights: next || null })
      .eq("id", unitId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    onSaved?.(next);
    setEditing(false);
    toast({ title: "Highlights saved" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setEditing(false);
          setText(initial ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="group/hl block w-full max-w-[280px] rounded-md border border-[hsl(var(--accent-gold)/0.4)] bg-[hsl(var(--accent-gold)/0.06)] p-2.5 text-left transition hover:border-[hsl(var(--accent-gold))] hover:bg-[hsl(var(--accent-gold)/0.12)]"
          title="Click to view / edit highlights"
        >
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 flex-none text-[hsl(var(--accent-gold))]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--accent-gold))]">
              Highlights
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground group-hover/hl:text-foreground">
              expand →
            </span>
          </div>
          {empty ? (
            <span className="text-xs italic text-muted-foreground">
              No highlights — click to add
            </span>
          ) : (
            <span
              className="block text-xs leading-snug text-foreground"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {initial}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Highlights — Unit {unitNumber}</DialogTitle>
          <DialogDescription>
            Description shown on the client presentation card. Edit any time.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Describe the location's appeal — visibility, audience, cross-streets…"
            className="resize-y"
          />
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {empty ? (
              <span className="italic text-muted-foreground">No highlights yet.</span>
            ) : (
              initial
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setText(initial ?? "");
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
