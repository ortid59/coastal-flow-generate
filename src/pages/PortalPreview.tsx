import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import Portal from "./Portal";
import { Button } from "@/components/ui/button";

/**
 * Admin-only preview of the client-facing Portal presentation.
 * Mounted under a ProtectedRoute so RLS uses the owner's auth.
 * Skips the password gate entirely.
 */
export default function PortalPreview() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="relative">
      {/* Floating preview banner — hidden on print */}
      <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 print:hidden">
        <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--accent-gold))] bg-card/95 px-4 py-1.5 text-xs shadow-elev-md backdrop-blur">
          <Eye className="h-3.5 w-3.5 text-[hsl(var(--accent-gold))]" />
          <span className="font-semibold uppercase tracking-wider">Admin preview</span>
          <span className="text-muted-foreground">— exactly what your client will see</span>
          <Button asChild size="sm" variant="ghost" className="h-7 -mr-2">
            <Link to={`/campaigns/${id}/review`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to review
            </Link>
          </Button>
        </div>
      </div>
      <Portal token="preview" campaignId={id} />
    </div>
  );
}
