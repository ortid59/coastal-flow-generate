import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { parseNumber } from "@/lib/parseNumber";

export { parseNumber };

type Props = {
  unitId: string;
  /** Column on `units` this cell writes to. */
  column: string;
  /** Text shown in the input when editing starts. */
  raw: string;
  /** What the cell renders when it is not being edited. */
  display: React.ReactNode;
  /**
   * Turn the typed text into the value stored on the row. Return `undefined`
   * to reject the edit (the cell stays open so the entry can be corrected).
   * Defaults to a trimmed string, or null when blank.
   */
  parse?: (text: string) => unknown;
  multiline?: boolean;
  align?: "left" | "right";
  placeholder?: string;
  title?: string;
  className?: string;
  /** Apply the saved value to local state so the grid updates immediately. */
  onSaved: (dbValue: any) => void;
};

const defaultParse = (text: string) => {
  const t = text.trim();
  return t === "" ? null : t;
};

/**
 * Click-to-edit grid cell. Enter (or blur) commits, Escape cancels — the same
 * gesture everywhere, so every column behaves the way Highlights already did.
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
  className = "",
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(raw);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Guards against blur firing a second save after Enter or Escape.
  const doneRef = useRef(false);

  useEffect(() => {
    if (!editing) setText(raw);
  }, [raw, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  const commit = async () => {
    if (doneRef.current) return;
    doneRef.current = true;

    const next = parse(text);
    if (next === undefined) {
      doneRef.current = false;
      toast({ title: "Not a valid value", description: "Check the format and try again.", variant: "destructive" });
      return;
    }

    const unchanged = (next ?? "") === (defaultParse(raw) ?? "");
    if (unchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("units")
      .update({ [column]: next } as any)
      .eq("id", unitId);
    setSaving(false);

    if (error) {
      doneRef.current = false;
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(next);
    setEditing(false);
  };

  const cancel = () => {
    doneRef.current = true;
    setText(raw);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        title={title ?? "Click to edit"}
        onClick={(e) => {
          e.stopPropagation();
          doneRef.current = false;
          setEditing(true);
        }}
        className={`group w-full rounded px-1 -mx-1 text-${align} hover:bg-[hsl(var(--ocean)/0.08)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--ocean))] ${className}`}
      >
        {display}
      </button>
    );
  }

  const shared = {
    ref: inputRef as any,
    value: text,
    placeholder,
    disabled: saving,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void commit();
      }
    },
    className: `w-full rounded border border-[hsl(var(--ocean))] bg-background px-1 py-0.5 text-${align} text-[11px] outline-none ${className}`,
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />}
      {saving && (
        <Loader2 className="absolute right-1 top-1 h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
