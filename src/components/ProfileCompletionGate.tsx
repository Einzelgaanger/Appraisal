import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import heroHub from '@/assets/hero-hub.jpg';
import {
  displayHierarchyLabel,
  GHC_DEPARTMENTS,
  GHC_ROLES,
  hierarchyLevelOptions,
  isGhcOrgContext,
} from '@/lib/hierarchyConvention';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { GHC_SUBSIDIARY_ID } from '@/tenants/config';

interface Subsidiary { id: string; name: string; hierarchy_lower_is_senior?: boolean; }
interface EmployeeOption {
  name: string;
  role: string | null;
  department: string | null;
  subsidiary_id: string;
  hierarchy_level: number | null;
  email: string | null;
}

interface ProfileDraft {
  name: string;
  role: string;
  department: string;
  subsidiaryId: string;
  hierarchyLevel: string;
}

const FALLBACK_DEPARTMENTS = ['Executive', 'Finance', 'HR', 'Investment', 'Legal', 'Operations', 'Portfolio', 'Sales', 'Technology'];
const FALLBACK_ROLES = ['Analyst', 'Associate', 'Senior Associate', 'Manager', 'Principal', 'Head of Department', 'Director', 'Partner'];

const uniqueSorted = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b));

const pickCanonical = (value: string | null | undefined, options: readonly string[]) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const match = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return match ?? '';
};

/** Map seeded GHC levels (incl. 4) onto the three profile seniority choices. */
const normalizeGhcLevelForForm = (level: number | null | undefined): string => {
  if (level == null || Number.isNaN(level)) return '';
  if (level <= 1) return '1';
  if (level === 2) return '2';
  return '3';
};

const draftStorageKey = (userId: string) => `vgg_profile_draft_${userId}`;

const readDraft = (userId: string | undefined): ProfileDraft | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileDraft>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      department: typeof parsed.department === 'string' ? parsed.department : '',
      subsidiaryId: typeof parsed.subsidiaryId === 'string' ? parsed.subsidiaryId : '',
      hierarchyLevel: typeof parsed.hierarchyLevel === 'string' ? parsed.hierarchyLevel : '',
    };
  } catch {
    return null;
  }
};

const writeDraft = (userId: string | undefined, draft: ProfileDraft) => {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
};

const clearDraft = (userId: string | undefined) => {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.removeItem(draftStorageKey(userId));
};

export default function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const { user, profile, refreshProfile, logout, isLoading: authProfileLoading } = useEmployeeAuth();
  const { tenant, setSubsidiaryHint } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState('');
  const [hierarchyLevel, setHierarchyLevel] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const hydratedRef = useRef(false);

  // Only decide after profile is loaded — never treat "profile still null" as incomplete.
  const needsCompletion =
    !authProfileLoading &&
    !!user &&
    (!profile?.profile_completed || !profile?.employee_id);
  const email = profile?.email ?? user?.email ?? '';
  const userId = user?.id;

  const ghcContext = isGhcOrgContext({
    appraisalMode: tenant.appraisalMode,
    subsidiaryId: subsidiaryId || (tenant.appraisalMode === 'ghc' ? GHC_SUBSIDIARY_ID : null),
  });

  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      const [subRes, empRes] = await Promise.all([
        supabase.from('subsidiaries').select('id, name, hierarchy_lower_is_senior').order('name'),
        supabase.from('employees').select('name, role, department, subsidiary_id, hierarchy_level, email').order('name'),
      ]);
      setSubsidiaries(subRes.data ?? []);
      setEmployees(empRes.data ?? []);
      setLoadingOptions(false);
    };

    void loadOptions();
  }, []);

  // Hydrate once from draft → profile → employee match. Never overwrite typed progress afterward.
  useEffect(() => {
    if (!needsCompletion || hydratedRef.current || loadingOptions) return;

    const draft = readDraft(userId);
    const matched = employees.find((employee) => employee.email?.trim().toLowerCase() === email.trim().toLowerCase());
    const seedSubsidiary =
      draft?.subsidiaryId ||
      profile?.subsidiary_id ||
      matched?.subsidiary_id ||
      (tenant.appraisalMode === 'ghc' ? GHC_SUBSIDIARY_ID : '') ||
      '';
    const seedIsGhc = seedSubsidiary === GHC_SUBSIDIARY_ID || tenant.appraisalMode === 'ghc';

    const seedDepartment = draft?.department
      || (seedIsGhc
        ? pickCanonical(profile?.department ?? matched?.department, GHC_DEPARTMENTS)
        : (profile?.department ?? matched?.department ?? ''));
    const seedRole = draft?.role
      || (seedIsGhc
        ? pickCanonical(profile?.role ?? matched?.role, GHC_ROLES)
        : (profile?.role ?? matched?.role ?? ''));
    const seedLevel = draft?.hierarchyLevel
      || (seedIsGhc
        ? normalizeGhcLevelForForm(profile?.hierarchy_level ?? matched?.hierarchy_level)
        : (profile?.hierarchy_level?.toString() ?? matched?.hierarchy_level?.toString() ?? ''));

    setName(draft?.name || profile?.name || matched?.name || '');
    setSubsidiaryId(seedSubsidiary);
    setDepartment(seedDepartment);
    setRole(seedRole);
    setHierarchyLevel(seedLevel);
    hydratedRef.current = true;
  }, [
    needsCompletion,
    loadingOptions,
    userId,
    email,
    employees,
    profile,
    tenant.appraisalMode,
  ]);

  // Persist in-progress answers so leaving / refreshing does not wipe them.
  useEffect(() => {
    if (!needsCompletion || !hydratedRef.current || !userId) return;
    writeDraft(userId, { name, role, department, subsidiaryId, hierarchyLevel });
  }, [needsCompletion, userId, name, role, department, subsidiaryId, hierarchyLevel]);

  const departmentOptions = useMemo(() => {
    if (ghcContext) {
      const extras = department && !GHC_DEPARTMENTS.includes(department as typeof GHC_DEPARTMENTS[number])
        ? [department]
        : [];
      return [...extras, ...GHC_DEPARTMENTS];
    }
    return uniqueSorted([...employees.map((employee) => employee.department), ...FALLBACK_DEPARTMENTS]);
  }, [employees, ghcContext, department]);

  const roleOptions = useMemo(() => {
    if (ghcContext) {
      const extras = role && !GHC_ROLES.includes(role as typeof GHC_ROLES[number])
        ? [role]
        : [];
      return [...extras, ...GHC_ROLES];
    }
    return uniqueSorted([...employees.map((employee) => employee.role), ...FALLBACK_ROLES]);
  }, [employees, ghcContext, role]);

  const profileHierarchyLowerSenior = useMemo(
    () => subsidiaries.find((s) => s.id === subsidiaryId)?.hierarchy_lower_is_senior ?? false,
    [subsidiaries, subsidiaryId],
  );

  const levelLabelOpts = {
    appraisalMode: tenant.appraisalMode,
    subsidiaryId: subsidiaryId || (tenant.appraisalMode === 'ghc' ? GHC_SUBSIDIARY_ID : null),
  };

  const levelOptions = useMemo(
    () => hierarchyLevelOptions(levelLabelOpts),
    [tenant.appraisalMode, subsidiaryId],
  );

  useEffect(() => {
    if (!hydratedRef.current || !hierarchyLevel) return;
    const n = Number(hierarchyLevel);
    if (!levelOptions.includes(n)) {
      setHierarchyLevel(ghcContext ? normalizeGhcLevelForForm(n) : '');
    }
  }, [hierarchyLevel, levelOptions, ghcContext]);

  const canSave = name.trim() && role.trim() && department.trim() && subsidiaryId && hierarchyLevel;

  const handleCompanyChange = (nextSubsidiaryId: string) => {
    setSubsidiaryId(nextSubsidiaryId);
    // Live-switch branding/theme while completing profile (localhost / unpinned hosts only).
    setSubsidiaryHint(nextSubsidiaryId);
    const nextIsGhc = nextSubsidiaryId === GHC_SUBSIDIARY_ID || tenant.appraisalMode === 'ghc';
    if (nextIsGhc) {
      setDepartment((current) => pickCanonical(current, GHC_DEPARTMENTS) || current);
      setRole((current) => pickCanonical(current, GHC_ROLES) || current);
      setHierarchyLevel((current) => normalizeGhcLevelForForm(current ? Number(current) : null) || current);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) {
      toast.error('Please complete every profile field.');
      return;
    }

    if (ghcContext) {
      if (!pickCanonical(department, GHC_DEPARTMENTS)) {
        toast.error('Please pick a GreenHouse Capital team from the list.');
        return;
      }
      if (!pickCanonical(role, GHC_ROLES)) {
        toast.error('Please pick a GreenHouse Capital role from the list.');
        return;
      }
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke('complete-profile', {
      body: {
        name,
        role: pickCanonical(role, GHC_ROLES) || role,
        department: pickCanonical(department, GHC_DEPARTMENTS) || department,
        subsidiary_id: subsidiaryId,
        hierarchy_level: Number(hierarchyLevel),
      },
    });
    setSaving(false);

    const remoteError =
      error?.message ||
      (data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : null);

    if (remoteError) {
      toast.error(remoteError || 'Profile could not be completed.');
      return;
    }

    clearDraft(userId);
    hydratedRef.current = false;
    await refreshProfile();
    toast.success('Profile completed. You can now continue.');
  };

  if (authProfileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!needsCompletion) return <>{children}</>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden border-r border-border lg:block">
          <img src={heroHub} alt="VGG people reviewing performance data" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-background/20" />
          <div className="absolute bottom-8 left-8 right-8 border border-border bg-background/90 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Employee record</p>
            <h1 className="mt-3 max-w-xl font-display text-5xl font-medium leading-none">Complete your profile before entering {tenant.branding.shortName} appraisal.</h1>
          </div>
        </section>

        <section className="flex items-center px-4 py-6 sm:px-8 lg:px-14">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-xl">
            <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
              <img src={brand.logoMark} alt={brand.logoAlt} className={brand.logoMarkClassName} />
              <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
            </div>

            <div className="mb-5 lg:hidden">
              <img src={heroHub} alt="VGG performance data session" className="h-36 w-full object-cover" />
            </div>

            <div className="surface-card p-5 sm:p-7">
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-primary bg-primary text-primary-foreground">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Required step</p>
                  <h2 className="mt-1 font-display text-2xl font-medium">Confirm your employee details</h2>
                  <p className="mt-1 text-sm text-muted-foreground">This places you correctly in the right tenant, review pools, and reporting lines.</p>
                </div>
              </div>

              {loadingOptions ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" maxLength={140} />
                  </div>

                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Select value={subsidiaryId || undefined} onValueChange={handleCompanyChange}>
                      <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                      <SelectContent>
                        {subsidiaries.map((subsidiary) => <SelectItem key={subsidiary.id} value={subsidiary.id}>{subsidiary.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={ghcContext ? undefined : 'profile-department'}>{ghcContext ? 'Team' : 'Department'}</Label>
                    {ghcContext ? (
                      <Select value={department || undefined} onValueChange={setDepartment}>
                        <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                        <SelectContent>
                          {departmentOptions.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input
                          id="profile-department"
                          list="department-options"
                          value={department}
                          onChange={(event) => setDepartment(event.target.value)}
                          placeholder="Pick from list or type your own"
                          maxLength={140}
                          autoComplete="off"
                        />
                        <datalist id="department-options">
                          {departmentOptions.map((option) => <option key={option} value={option} />)}
                        </datalist>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={ghcContext ? undefined : 'profile-role'}>Role / title</Label>
                    {ghcContext ? (
                      <Select value={role || undefined} onValueChange={setRole}>
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input
                          id="profile-role"
                          list="role-options"
                          value={role}
                          onChange={(event) => setRole(event.target.value)}
                          placeholder="Pick from list or type your own"
                          maxLength={140}
                          autoComplete="off"
                        />
                        <datalist id="role-options">
                          {roleOptions.map((option) => <option key={option} value={option} />)}
                        </datalist>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Seniority level</Label>
                    <Select value={hierarchyLevel || undefined} onValueChange={setHierarchyLevel}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        {levelOptions.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {displayHierarchyLabel(value, profileHierarchyLowerSenior, levelLabelOpts)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <p>
                      {ghcContext
                        ? 'Your answers are kept on this device until you save. Then they place you into the right GreenHouse Capital team, role, and seniority pool.'
                        : 'Your answers are kept on this device until you save. They place reviews into the right company, department, and hierarchy pools.'}
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={!canSave || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save and continue
                  </Button>
                </form>
              )}
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
