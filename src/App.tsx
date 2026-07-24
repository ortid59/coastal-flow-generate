import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
const GuidePage = lazy(() => import("./pages/GuidePage"));
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppHeader } from "@/components/AppHeader";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NewCampaign from "./pages/NewCampaign";
import CampaignReview from "./pages/CampaignReview";
import PortalPreview from "./pages/PortalPreview";
import Settings from "./pages/Settings";
import PortalGate from "./pages/PortalGate";
import ProposalPrint from "./pages/ProposalPrint";
import OAuthConsent from "./pages/OAuthConsent";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppHeader />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/guide" element={<Suspense fallback={null}><GuidePage /></Suspense>} />
            {/* Public, password-gated proposal page */}
            <Route path="/p/:token" element={<PortalGate />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/new"
              element={
                <ProtectedRoute>
                  <NewCampaign />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/review"
              element={
                <ProtectedRoute>
                  <CampaignReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/preview"
              element={
                <ProtectedRoute>
                  <PortalPreview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* Publicly reachable so client portal (/p/:token) can open the
                print deck in a new tab. RLS gates campaign/unit reads to those
                with a portal_token set; admins remain authorized via their session. */}
            <Route
              path="/proposal-print/:campaignId"
              element={<ProposalPrint />}
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
