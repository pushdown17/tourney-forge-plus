import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CreateTournament from "./pages/CreateTournament";
import Tournament from "./pages/Tournament";
import BracketDemo from "./pages/BracketDemo";
import PlayerProfile from "./pages/PlayerProfile";
import RefereeStation from "./pages/RefereeStation";
import NotFound from "./pages/NotFound";
import { syncServerTimeOffset } from "@/lib/serverTime";

const queryClient = new QueryClient();

const RedirectOnRefresh = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!hasRedirected.current && location.pathname !== "/") {
      hasRedirected.current = true;
      navigate("/", { replace: true });
    }
  }, []);

  return null;
};

const App = () => {
  useEffect(() => {
    syncServerTimeOffset();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RedirectOnRefresh />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/create-tournament" element={<CreateTournament />} />
            <Route path="/tournament/:id" element={<Tournament />} />
            <Route path="/bracket-demo" element={<BracketDemo />} />
            <Route path="/player/:name" element={<PlayerProfile />} />
            <Route path="/referee-station/:stationId" element={<RefereeStation />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
