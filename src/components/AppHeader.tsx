import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Settings as SettingsIcon, HelpCircle } from "lucide-react";
import { Logo } from "@/components/Logo";

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
          <Logo size={40} className="transition-transform group-hover:scale-105" />
          <div className="hidden sm:block leading-tight border-l pl-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Proposal Generator
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="/guide"
            target="_blank"
            rel="noopener noreferrer"
            title="User Guide"
            aria-label="Open User Guide"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground hover:border-foreground/40"
          >
            <HelpCircle className="h-4 w-4" />
          </a>
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
