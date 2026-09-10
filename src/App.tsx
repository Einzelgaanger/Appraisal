import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { EmployeeAuthProvider, useEmployeeAuth } from "@/contexts/EmployeeAuthContext";
import Onboarding from "./pages/Onboarding";
import Index from "./pages/Index";
import EmployeeLogin from "./pages/EmployeeLogin";
import FindAccount from "./pages/FindAccount";
import ResetPassword from "./pages/ResetPassword";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DemoDashboard from "./pages/DemoDashboard";
import EmployeeHub from "./pages/EmployeeHub";
import AppraisalAdmin from "./pages/AppraisalAdmin";
import NotFound from "./pages/NotFound";
import Docs from "./pages/Docs";
import MvpDemo from "./pages/MvpDemo";
import ProfileCompletionGate from "@/components/ProfileCompletionGate";
import { AppBootstrapSkeleton } from "@/components/shell/LoadingShells";
import { TenantProvider, useTenant } from "@/tenants/TenantContext";

const queryClient = new QueryClient();

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated: isLegacyAdmin } = useAuth();
  const { isAuthenticated: isEmployee, isAdmin, isLoading } = useEmployeeAuth();
  if (isLoading) return <AppBootstrapSkeleton />;
  if (isLegacyAdmin || (isEmployee && isAdmin)) return <>{children}</>;
  return <Navigate to="/admin" replace />;
}

function ProtectedEmployeeRoute({
  children,
  requireProfile = true,
}: {
  children: React.ReactNode;
  requireProfile?: boolean;
}) {
  const { isAuthenticated, isAuthLoading } = useEmployeeAuth();
  const location = useLocation();
  if (isAuthLoading) return <AppBootstrapSkeleton />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!requireProfile) return <>{children}</>;
  return <ProfileCompletionGate>{children}</ProfileCompletionGate>;
}

function EmployeeLoginRedirect() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/hub?tab=survey';
  return <Navigate to={target} replace />;
}

function AdminGate() {
  const { isAuthenticated: isLegacyAdmin } = useAuth();
  const { isAuthenticated: isEmployee, isAdmin, isLoading } = useEmployeeAuth();
  const { tenant } = useTenant();
  if (isLoading) return <AppBootstrapSkeleton />;
  if (isLegacyAdmin || (isEmployee && isAdmin)) {
    return <Navigate to={tenant.capabilities.showLegacyDashboard ? "/dashboard" : "/appraisal"} replace />;
  }
  return <Login />;
}

function HomeRoute() {
  const { isAuthenticated: isEmployee, isAuthLoading } = useEmployeeAuth();
  if (isAuthLoading) return <AppBootstrapSkeleton />;
  return isEmployee ? <Navigate to="/hub?tab=survey" replace /> : <Onboarding />;
}

function LoginRoute() {
  const { isAuthenticated: isEmployee, isAuthLoading } = useEmployeeAuth();
  if (isAuthLoading) return <AppBootstrapSkeleton />;
  return isEmployee ? <EmployeeLoginRedirect /> : <EmployeeLogin />;
}

function AppRoutes() {
  const { tenant } = useTenant();
  const showLegacyDashboard = tenant.capabilities.showLegacyDashboard;
  const showRankings = tenant.capabilities.showRankings;
  const showDemoRoute = tenant.capabilities.showDemoRoute;

  return (
    <Routes>
      <Route path="/omotola" element={<Navigate to="/hub?tab=survey" replace />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/docs/:section" element={<Docs />} />
      <Route path="/mvp" element={<MvpDemo />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/landing" element={<Index />} />
      <Route path="/find-account" element={<FindAccount />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/hub" element={<ProtectedEmployeeRoute><EmployeeHub /></ProtectedEmployeeRoute>} />
      {/* Legacy routes redirect to hub */}
      <Route path="/survey" element={<Navigate to="/hub?tab=survey" replace />} />
      <Route path="/my-dashboard" element={<Navigate to="/hub?tab=dashboard" replace />} />
      <Route path="/wall-of-fame" element={<Navigate to={showRankings ? "/hub?tab=rankings" : "/hub?tab=survey"} replace />} />
      <Route path="/admin" element={<AdminGate />} />
      <Route
        path="/dashboard"
        element={
          !showLegacyDashboard ? (
            <ProtectedAdminRoute><Navigate to="/appraisal" replace /></ProtectedAdminRoute>
          ) : (
            <ProtectedAdminRoute><Dashboard /></ProtectedAdminRoute>
          )
        }
      />
      <Route path="/appraisal" element={<ProtectedAdminRoute><AppraisalAdmin /></ProtectedAdminRoute>} />
      <Route path="/demo" element={showDemoRoute ? <DemoDashboard /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <TenantProvider>
            <EmployeeAuthProvider>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </EmployeeAuthProvider>
          </TenantProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
