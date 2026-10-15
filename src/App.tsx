import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppSettingsProvider, FeatureGate } from "@/hooks/useAppSettings";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LocationsMap from "./pages/LocationsMap";
import Attendance from "./pages/Attendance";
import OAuthConsent from "./pages/OAuthConsent";
import Settings from "./pages/Settings";
import ManageUsers from "./pages/ManageUsers";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppSettingsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/locations" element={<FeatureGate feature="locations_enabled"><LocationsMap /></FeatureGate>} />
            <Route path="/attendance" element={<FeatureGate feature="attendance_enabled"><Attendance /></FeatureGate>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<ManageUsers />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <BottomNav />
        </BrowserRouter>
        </AppSettingsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
