import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Construction } from "lucide-react";

export default function CampaignReview() {
  return (
    <main className="container-app py-14">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>
      <div className="surface-card flex flex-col items-center gap-4 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="font-heading">Review screen — coming in M3</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Files are uploaded. The parse-excel function (M2) lands next, then this page becomes the unit grid + master map.
        </p>
      </div>
    </main>
  );
}
