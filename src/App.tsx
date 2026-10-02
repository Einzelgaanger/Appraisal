import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { EmployeeAuthProvider, useEmployeeAuth } from "@/contexts/EmployeeAuthContext";
import VggWorkspacePortal from "./pages/VggWorkspacePortal";
import CompanyWorkspaceEntry from "./pages/CompanyWorkspaceEntry";
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
import TenantSubsidiaryBridge from "@/tenants/TenantSubsidiaryBridge";
import TenantLockEnforcer from "@/tenants/TenantLockEnforcer";
import LocalDevBanner from "@/components/LocalDevBanner";
import { isApexHostname, isTenantSubdomainHost } from "@/tenants/config";
import { companyWorkspaceUrl } from "@/tenants/companyHome";

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
  const { isAuthenticated, isLoading } = useEmployeeAuth();
  const location = useLocation();
  // Wait for session + profile so we never flash the company/role gate for completed users.
  if (isLoading) return <AppBootstrapSkeleton />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!requireProfile) return <>{children}</>;
  return <ProfileCompletionGate>{children}</ProfileCompletionGate>;
}

function companyPath(slug: string | null | undefined, pathWithSearch: string) {
  if (!slug || typeof window === 'undefined') return pathWithSearch;
  const dest = new URL(companyWorkspaceUrl(slug, pathWithSearch));
  if (dest.origin !== window.location.origin) {
    window.location.replace(dest.href);
    return null;
  }
  return `${dest.pathname}${dest.search}`;
}

function EmployeeLoginRedirect() {
  const location = useLocation();
  const { isLoading, lockedTenantSlug } = useEmployeeAuth();
  if (isLoading) return <AppBootstrapSkeleton />;
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/hub?tab=survey';
  const next = companyPath(lockedTenantSlug, target);
  if (next === null) return <AppBootstrapSkeleton />;
  return <Navigate to={next} replace />;
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
  const { isAuthenticated: isEmployee, isLoading, lockedTenantSlug } = useEmployeeAuth();
  if (isLoading) return <AppBootstrapSkeleton />;
  if (isEmployee) {
    const next = companyPath(lockedTenantSlug, '/hub?tab=survey');
    if (next === null) return <AppBootstrapSkeleton />;
    return <Navigate to={next} replace />;
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const tenantOverride = params.get('tenant');

  if (isApexHostname(hostname) && !tenantOverride) {
    return <VggWorkspacePortal />;
  }
  if (isTenantSubdomainHost(hostname) || tenantOverride) {
    return <CompanyWorkspaceEntry />;
  }
  return <VggWorkspacePortal />;
}

function LoginRoute() {
  const { isAuthenticated: isEmployee, isLoading } = useEmployeeAuth();
  if (isLoading) return <AppBootstrapSkeleton />;
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
      <Route path="/landing" element={<Navigate to="/" replace />} />
      <Route path="/onboarding" element={<Navigate to="/" replace />} />
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
              <TenantSubsidiaryBridge>
                <TenantLockEnforcer>
                <AuthProvider>
                  <LocalDevBanner />
                  <AppRoutes />
                </AuthProvider>
                </TenantLockEnforcer>
              </TenantSubsidiaryBridge>
            </EmployeeAuthProvider>
          </TenantProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
