import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Trades from "./pages/Trades";
import TradeNew from "./pages/TradeNew";
import TradeDetail from "./pages/TradeDetail";
import Settings from "./pages/Settings";
import SettingsConditions from "./pages/SettingsConditions";
import SettingsTags from "./pages/SettingsTags";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades"
              element={<ProtectedRoute><AppLayout><Trades /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades/new"
              element={<ProtectedRoute><AppLayout><TradeNew /></AppLayout></ProtectedRoute>}
            />
            <Route
              path="/trades/:id"
              element={<ProtectedRoute><AppLayout><TradeDetail /></AppLayout></ProtectedRoute>}
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
