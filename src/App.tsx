import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { FilterProvider } from "@/contexts/FilterContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Trades from "./pages/Trades";
import TradeNew from "./pages/TradeNew";
import TradeDetail from "./pages/TradeDetail";
import TradeEdit from "./pages/TradeEdit";
import Notes from "./pages/Notes";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import SettingsConditions from "./pages/SettingsConditions";
import SettingsTags from "./pages/SettingsTags";
import CalendarPage from "./pages/CalendarPage";
import RecapQuiz from "./pages/RecapQuiz";
import Compare from "./pages/Compare";
import OAuthConsent from "./pages/OAuthConsent";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ProfileProvider>
      <FilterProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

            <Route
              path="/dashboard"
              element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/calendar"
              element={<ProtectedRoute><AppLayout><CalendarPage /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades"
              element={<ProtectedRoute><AppLayout><Trades /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/compare"
              element={<ProtectedRoute><AppLayout><Compare /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/recap-quiz"
              element={<ProtectedRoute><AppLayout><RecapQuiz /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades/new"
              element={<ProtectedRoute><AppLayout><TradeNew /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/notes"
              element={<ProtectedRoute><AppLayout><Notes /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades/:id/edit"
              element={<ProtectedRoute><AppLayout><TradeEdit /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades/:id"
              element={<ProtectedRoute><AppLayout><TradeDetail /></AppLayout></ProtectedRoute>}
            />

            <Route
              path="/profile"
              element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/settings"
              element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>}
            >
              <Route index element={<Navigate to="/settings/conditions" replace />} />
              <Route path="conditions" element={<SettingsConditions />} />
              <Route path="tags" element={<SettingsTags />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </FilterProvider>
      </ProfileProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
