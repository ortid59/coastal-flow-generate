import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseNumber } from "@/lib/parseNumber";

export { parseNumber };

type Props = {
  unitId: string;
  /** Column on `units` this cell writes to. */
  column: string;
  /** Text shown in the editor when editing starts. */
  raw: string;
  /** What the cell renders when it is not being edited. */
  display: React.ReactNode;
  /**
   * Turn the typed text into the value stored on the row. Return `undefined`
   * to reject the edit (the editor stays open so the entry can be corrected).
   * Defaults to a trimmed string, or null when blank.
   */
  parse?: (text: string) => unknown;
  multiline?: boolean;
  align?: "left" | "right";
  placeholder?: string;
  title?: string;
  /** Heading shown at the top of the editor. Falls back to the column name. */
  label?: string;
  className?: string;
  /** Apply the saved value to local state so the grid updates immediately. */
  onSaved: (dbValue: any) => void;
};

const defaultParse = (text: string) => {
  const t = text.trim();
  return t === "" ? null : t;
};

const prettyColumn = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/**
 * Click-to-edit grid cell.
 *
 * The editor opens in a popover rather than turning the cell into a one-line
 * input: grid columns are narrow, and a location description or long unit name
 * was unreadable through a 120px box — you had to scroll the caret along to
 * read your own text. The popover is wide enough to see the whole value, the
 * same way the Highlights editor works.
 */
export function EditableCell({
  unitId,
  column,
  raw,
  display,
  parse = defaultParse,
  multiline = false,
  align = "left",
  placeholder,
  title,
  label,
  className = "",
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(raw);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Set when the user cancels, so the close handler doesn't also save.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) setText(raw);
  }, [raw, open]);

  const commit = async () => {
    const next = parse(text);
    if (next === undefined) {
      toast({
        title: "Not a valid value",
        description: "Check the format and try again.",
        variant: "destructive",
      });
      return;
    }

    if ((next ?? "") === (defaultParse(raw) ?? "")) {
      setOpen(false);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("units")
      .update({ [column]: next } as any)
      .eq("id", unitId);
    setSaving(false);

    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(next);
    setOpen(false);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setText(raw);
    setOpen(false);
  };

  const hint = multiline ? "Ctrl+Enter to save · Esc to cancel" : "Enter to save · Esc to cancel";

  const fieldProps = {
    ref: fieldRef as any,
    value: text,
    placeholder,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void commit();
      }
    },
    className:
      "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-snug outline-none focus:border-[hsl(var(--ocean))] focus:ring-1 focus:ring-[hsl(var(--ocean))]",
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          cancelledRef.current = false;
          setOpen(true);
          return;
        }
        // Closing: clicking away saves, cancelling discards.
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setText(raw);
          setOpen(false);
        } else {
          void commit();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title ?? "Click to edit"}
          onClick={(e) => e.stopPropagation()}
          className={`w-full rounded px-1 -mx-1 text-${align} hover:bg-[hsl(var(--ocean)/0.08)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--ocean))] ${className}`}
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[460px] max-w-[92vw] p-3"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          fieldRef.current?.focus();
          fieldRef.current?.select?.();
        }}
      >
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label ?? title ?? prettyColumn(column)}
        </div>
        {multiline ? <textarea rows={6} {...fieldProps} /> : <input type="text" {...fieldProps} />}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{hint}</span>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void commit()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
