import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  employee_id: string | null;
  name: string;
  email: string;
  role: string | null;
  department: string | null;
  subsidiary_id: string | null;
  hierarchy_level: number | null;
  profile_completed: boolean | null;
  profile_completed_at: string | null;
  profile_confirmed_at: string | null;
  created_at: string | null;
}

interface EmployeeAuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** True until initial session read completes — use for route guards */
  isAuthLoading: boolean;
  /** True while profile/admin role is loading after sign-in */
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextType | undefined>(undefined);

export function EmployeeAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setProfileLoading(!!session);
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setProfileLoading(!!session);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch profile and admin role when user changes
  useEffect(() => {
    let cancelled = false;

    const loadUserContext = async () => {
      if (!user) {
        setProfile(null);
        setIsAdmin(false);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);

      const [{ data: profileData }, { data: roleData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle(),
      ]);

      let resolvedProfile = profileData as Profile | null;
      const normalizedEmail = resolvedProfile?.email?.trim().toLowerCase();

      if (resolvedProfile && !resolvedProfile.employee_id && normalizedEmail) {
        const { data: employeeData } = await supabase
          .from('employees')
          .select('id, department')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (employeeData) {
          const nextDepartment = resolvedProfile.department ?? employeeData.department;
          resolvedProfile = {
            ...resolvedProfile,
            employee_id: employeeData.id,
            department: nextDepartment,
          };

          void supabase
            .from('profiles')
            .update({
              employee_id: employeeData.id,
              department: nextDepartment,
            })
            .eq('id', user.id);
        }
      }

      if (cancelled) return;
      setProfile(resolvedProfile);
      setIsAdmin(!!roleData);
      setProfileLoading(false);
    };

    void loadUserContext();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    setProfile(profileData as Profile | null);
    setIsAdmin(!!roleData);
    setProfileLoading(false);
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      setProfileLoading(true);
      setAuthReady(true);
    }
    return { error: error?.message ?? null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    setProfileLoading(false);
  };

  const resetPassword = async (email: string) => {
    const siteUrl = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  return (
    <EmployeeAuthContext.Provider
      value={{
        user, session, profile,
        isAuthenticated: !!session,
        isAdmin,
        isAuthLoading: !authReady,
        isLoading: !authReady || profileLoading,
        refreshProfile,
        login, logout, resetPassword, updatePassword,
      }}
    >
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  const context = useContext(EmployeeAuthContext);
  if (!context) throw new Error('useEmployeeAuth must be used within EmployeeAuthProvider');
  return context;
}
