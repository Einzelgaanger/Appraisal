import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { AppBootstrapSkeleton } from '@/components/shell/LoadingShells';
import ForcePasswordChange from '@/pages/ForcePasswordChange';

/**
 * A shared demo password still opens the session. It does not open the app
 * until the person replaces it. Recovery links keep their own screen.
 */
export default function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, profile } = useEmployeeAuth();
  const location = useLocation();

  if (isLoading) return <AppBootstrapSkeleton />;
  if (
    isAuthenticated &&
    profile?.must_change_password &&
    location.pathname !== '/reset-password'
  ) {
    return <ForcePasswordChange />;
  }
  return <>{children}</>;
}
