import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Files,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
} from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type VendorFile = {
  id: string;
  campaign_id: string | null;
  storage_path: string;
  original_name: string | null;
  kind: string | null;
  vendor: string | null;
  created_at: string | null;
};

type Job = {
  id: string;
  kind: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

type UnitOption = { id: string; unit_number: string };

const KIND_META: Record<
  string,
  { label: string; tone: string; Icon: typeof FileSpreadsheet }
> = {
  excel: { label: "Quotes (Excel)", tone: "text-[hsl(var(--ocean))]", Icon: FileSpreadsheet },
  photosheets: { label: "Photo sheet PDF", tone: "text-[hsl(var(--accent-gold))]", Icon: FileText },
  pdf: { label: "Vendor PDF", tone: "text-[hsl(var(--accent-gold))]", Icon: FileText },
  image: { label: "Photo", tone: "text-[hsl(var(--ocean))]", Icon: ImageIcon },
};

const JOB_LABEL: Record<string, string> = {
  "parse-excel": "Excel parsed",
  "extract-photos": "Photos extracted",
  "extract-highlights": "Highlights extracted",
  "fetch-minimaps": "Map images fetched",
};

const fmtDate = (d: string | null) =>
  d ? format(new Date(d), "MMM d, yyyy · h:mm a") : "—";

type Props = {
  campaignId: string;
  units?: UnitOption[];
  onUnitChanged?: () => void;
};

export function CampaignFilesHistory({ campaignId, units = [], onUnitChanged }: Props) {
  const { toast } = useToast();
  const [files, setFiles] = useState<VendorFile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [vf, jb] = await Promise.all([
      supabase
        .from("vendor_files")
        .select("id, campaign_id, storage_path, original_name, kind, vendor, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      supabase
        .from("jobs")
        .select("id, kind, status, started_at, finished_at, error_message")
        .eq("campaign_id", campaignId)
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    setFiles((vf.data ?? []) as VendorFile[]);
    setJobs((jb.data ?? []) as Job[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const visibleFiles = expanded ? files : files.slice(0, 4);
  const visibleJobs = expanded ? jobs : jobs.slice(0, 4);

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  // Assign an image vendor_file to a specific unit.
  // Copies the bytes from `uploads` → `photos`, signs a long URL, and stores
  // it on the unit's billboard_photo_url.
  const assignToUnit = async (file: VendorFile, unitId: string) => {
    setAssigningId(file.id);
    try {
      const dl = await supabase.storage.from("uploads").download(file.storage_path);
      if (dl.error || !dl.data) throw dl.error ?? new Error("Download failed");
      const blob = dl.data;
      const ext = /\.png$/i.test(file.original_name ?? "") ? "png" : "jpg";
      const path = `${campaignId}/manual/${unitId}.${ext}`;
      const up = await supabase.storage
        .from("photos")
        .upload(path, blob, {
          contentType: ext === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });
      if (up.error) throw up.error;
      const signed = await supabase.storage
        .from("photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed.error || !signed.data?.signedUrl) {
        throw signed.error ?? new Error("Couldn't sign URL");
      }
      const { error: updErr } = await supabase
        .from("units")
        .update({ billboard_photo_url: signed.data.signedUrl })
        .eq("id", unitId);
      if (updErr) throw updErr;
      const unit = units.find((u) => u.id === unitId);
      toast({
        title: "Photo assigned",
        description: unit ? `Linked to unit ${unit.unit_number}` : undefined,
      });
      onUnitChanged?.();
    } catch (err: any) {
      toast({
        title: "Assignment failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <section className="surface-card mt-6 p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-base flex items-center gap-2">
            <Files className="h-4 w-4 text-[hsl(var(--ocean))]" />
            Files & history
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vendor uploads and processing log for this campaign.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Files */}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Uploaded files ({files.length})
            </h4>
            {files.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">No files uploaded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleFiles.map((f) => {
                  const meta = KIND_META[f.kind ?? ""] ?? KIND_META.pdf;
                  const canAssign = f.kind === "image" && units.length > 0;
                  return (
                    <li
                      key={f.id}
                      className="rounded-md border border-border bg-muted/30 p-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <meta.Icon className={`mt-0.5 h-3.5 w-3.5 flex-none ${meta.tone}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-foreground">
                              {f.original_name ?? f.storage_path.split("/").pop()}
                            </span>
                            <span className="rounded-full bg-card border border-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {meta.label}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {fmtDate(f.created_at)}
                            {f.vendor ? ` · ${f.vendor}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openFile(f.storage_path)}
                          className="flex-none text-muted-foreground hover:text-foreground"
                          title="Open"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {canAssign && (
                        <div className="mt-2 flex items-center gap-2 pl-6">
                          <Link2 className="h-3 w-3 flex-none text-muted-foreground" />
                          <Select
                            disabled={assigningId === f.id}
                            onValueChange={(unitId) => assignToUnit(f, unitId)}
                          >
                            <SelectTrigger className="h-7 text-[11px] flex-1">
                              <SelectValue
                                placeholder={
                                  assigningId === f.id
                                    ? "Assigning…"
                                    : "Assign to unit…"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {units.map((u) => (
                                <SelectItem
                                  key={u.id}
                                  value={u.id}
                                  className="text-[11px]"
                                >
                                  {u.unit_number}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Jobs / change log */}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="mr-1 inline h-3 w-3" /> Activity log
            </h4>
            {jobs.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleJobs.map((j) => {
                  const ok = j.status === "succeeded";
                  const failed = j.status === "failed";
                  return (
                    <li
                      key={j.id}
                      className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 p-2.5"
                    >
                      {ok ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />
                      ) : failed ? (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-destructive" />
                      ) : (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-none animate-spin text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground">
                          {JOB_LABEL[j.kind ?? ""] ?? j.kind ?? "Job"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {fmtDate(j.finished_at ?? j.started_at)}
                          {failed && j.error_message ? ` · ${j.error_message}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {(files.length > 4 || jobs.length > 4) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--ocean))] hover:underline"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show all <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </section>
  );
}
