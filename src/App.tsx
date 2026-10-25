import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import SettingsMetrics from "./pages/SettingsMetrics";
import CalendarPage from "./pages/CalendarPage";
import RecapQuiz from "./pages/RecapQuiz";
import Compare from "./pages/Compare";
import NotFound from "./pages/NotFound";
import SettingsWidget from "./pages/SettingsWidget";
import SettingsAbout from "./pages/SettingsAbout";
import UpdateNotification from "./components/UpdateNotification";


const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (window.electronAPI) {
      const unsubscribe = window.electronAPI.onOAuthCallback(async (url) => {
        try {
          const urlObj = new URL(url.replace("trade-blitz-log://", "http://localhost/"));
          const hash = urlObj.hash || urlObj.search;
          const params = new URLSearchParams(hash.replace("#", "?"));

          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (error) {
              toast.error(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
            } else {
              toast.success("เข้าสู่ระบบด้วย Google สำเร็จแล้ว!");
              window.location.hash = "#/dashboard";
            }
          } else {
            toast.error("ไม่พบคีย์สำหรับยืนยันตัวตนในลิงก์");
          }
        } catch (err: any) {
          toast.error(`เกิดข้อผิดพลาดในการดึงคีย์เข้าสู่ระบบ: ${err.message}`);
        }
      });

      return () => {
        unsubscribe();
      };
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProfileProvider>
        <FilterProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <UpdateNotification />
          <HashRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

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
              <Route path="widget" element={<SettingsWidget />} />
              <Route path="about" element={<SettingsAbout />} />
              <Route path="metrics" element={<SettingsMetrics />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
      </FilterProvider>
      </ProfileProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
