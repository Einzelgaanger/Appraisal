import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { getTenantBySlug, resolveTenantFromHostname } from '@/tenants/config';
import { companyOrigin, lookupTenantSlugForEmail } from '@/tenants/companyHome';

interface Profile {
  id: string;
  employee_id: string | null;
  name: string;
  email: string;
  role: string | null;
  department: string | null;
  subsidiary_id: string | null;
  hierarchy_level: number | null;
  avatar_url: string | null;
  profile_completed: boolean | null;
  profile_completed_at: string | null;
  profile_confirmed_at: string | null;
  created_at: string | null;
}

/** A company this login may act as, from the my_companies() RPC. */
export interface Company {
  employee_id: string;
  tenant_slug: string | null;
  company_name: string | null;
  employee_role: string | null;
  is_active: boolean;
}

const db = supabase as any;

/**
 * Where this login may work, and which company it is currently acting as.
 *
 * Routing follows the active company rather than employees.locked_tenant_slug,
 * which also covers everyone who was never given a lock.
 */
async function loadCompanyContext(employeeId: string | null | undefined) {
  const { data: companyRows } = await db.rpc('my_companies');
  const companies = (companyRows ?? []) as Company[];

  const active = companies.find((c) => c.is_active) ?? companies[0];
  const activeEmployeeId = active?.employee_id ?? employeeId ?? null;

  let companyAdmin = false;
  let staticLock: string | null = null;

  if (activeEmployeeId) {
    const { data } = await supabase
      .from('employees')
      .select('locked_tenant_slug, company_admin')
      .eq('id', activeEmployeeId)
      .maybeSingle();
    const row = data as { locked_tenant_slug?: string | null; company_admin?: boolean | null } | null;
    companyAdmin = !!row?.company_admin;
    staticLock = row?.locked_tenant_slug?.trim().toLowerCase() || null;
  }

  return { companies, companyAdmin, lock: active?.tenant_slug ?? staticLock };
}

interface EmployeeAuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  /** Platform admin (user_roles) or company People Ops admin on the active roster row. */
  isAdmin: boolean;
  /** Global platform admin only (`user_roles.admin`). */
  isPlatformAdmin: boolean;
  /** Company-scoped admin (VigiPay People Ops / GM) — not global platform admin. */
  isCompanyAdmin: boolean;
  /** Every company this login may act as. More than one means the switcher applies. */
  companies: Company[];
  /** Move this login to another of its companies, then route to that tenant. */
  switchCompany: (employeeId: string) => Promise<{ error: string | null }>;
  /** Tenant slug to route to, taken from the active company. */
  lockedTenantSlug: string | null;
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
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [lockedTenantSlug, setLockedTenantSlug] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
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
        setIsPlatformAdmin(false);
        setIsCompanyAdmin(false);
        setLockedTenantSlug(null);
        setCompanies([]);
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
          .select('id, department, locked_tenant_slug, company_admin')
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

      const { companies: myCompanies, companyAdmin, lock } = await loadCompanyContext(
        resolvedProfile?.employee_id,
      );

      if (cancelled) return;
      setCompanies(myCompanies);
      setIsCompanyAdmin(companyAdmin);
      setLockedTenantSlug(lock);
      const platformAdmin = !!roleData;
      setIsPlatformAdmin(platformAdmin);
      setIsAdmin(platformAdmin || companyAdmin);
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
    const nextProfile = profileData as Profile | null;
    setProfile(nextProfile);

    const { companies: myCompanies, companyAdmin, lock } = await loadCompanyContext(
      nextProfile?.employee_id,
    );
    setCompanies(myCompanies);
    setIsCompanyAdmin(companyAdmin);
    setLockedTenantSlug(lock);
    const platformAdmin = !!roleData;
    setIsPlatformAdmin(platformAdmin);
    setIsAdmin(platformAdmin || companyAdmin);
    setProfileLoading(false);
  };

  const switchCompany = async (employeeId: string) => {
    const { error } = await db.rpc('set_active_company', { _employee_id: employeeId });
    if (error) return { error: error.message as string };
    // Reloading rewrites lockedTenantSlug, which TenantLockEnforcer then follows to
    // the new company's host.
    await refreshProfile();
    return { error: null };
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
    setIsPlatformAdmin(false);
    setIsCompanyAdmin(false);
    setLockedTenantSlug(null);
    setProfileLoading(false);
  };

  const resetPassword = async (email: string) => {
    // Recovery links must land on the person's company host so the token matches
    // that host's allowlist, and so the email hook can brand from redirect_to.
    const fromRoster = await lookupTenantSlugForEmail(email);
    const tenant =
      getTenantBySlug(fromRoster) ??
      resolveTenantFromHostname(window.location.hostname, window.location.search, {
        lockedTenantSlug: fromRoster ?? lockedTenantSlug,
      });
    const origin = companyOrigin(tenant.slug);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password?tenant=${tenant.slug}`,
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
        isPlatformAdmin,
        isCompanyAdmin,
        companies,
        switchCompany,
        lockedTenantSlug,
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
