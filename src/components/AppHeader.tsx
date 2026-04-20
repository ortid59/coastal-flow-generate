import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import brand from "@/config/brand.json";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  // Hide on portal/public proposal pages
  const isPortal = location.pathname.startsWith("/portal") || location.pathname.startsWith("/p/");

  if (isPortal) return null;

  return (
    <header className="border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-40">
      <div className="container-app flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-hero text-primary-foreground font-heading font-bold shadow-elev-sm transition-transform group-hover:scale-105">
            CM
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold text-foreground">{brand.name}</div>
            <div className="text-xs text-muted-foreground">Proposal Generator</div>
          </div>
        </Link>
        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" title="Team access">
                <SettingsIcon className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Team</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
