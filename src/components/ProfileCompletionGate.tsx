import { useEffect, useMemo, useState } from 'react';
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
import vggLogo from '@/assets/vgg-logo.webp';
import heroHub from '@/assets/hero-hub.jpg';
import { displayHierarchyLabel } from '@/lib/hierarchyConvention';
import { useTenant } from '@/tenants/TenantContext';

interface Subsidiary { id: string; name: string; hierarchy_lower_is_senior?: boolean; }
interface EmployeeOption {
  name: string;
  role: string | null;
  department: string | null;
  subsidiary_id: string;
  hierarchy_level: number | null;
  email: string | null;
}

const HIERARCHY_LEVEL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

const FALLBACK_DEPARTMENTS = ['Executive', 'Finance', 'HR', 'Investment', 'Legal', 'Operations', 'Portfolio', 'Sales', 'Technology'];
const FALLBACK_ROLES = ['Analyst', 'Associate', 'Senior Associate', 'Manager', 'Principal', 'Head of Department', 'Director', 'Partner'];

const uniqueSorted = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b));

export default function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const { user, profile, refreshProfile, logout } = useEmployeeAuth();
  const { tenant } = useTenant();
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [name, setName] = useState(profile?.name ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [subsidiaryId, setSubsidiaryId] = useState(profile?.subsidiary_id ?? '');
  const [hierarchyLevel, setHierarchyLevel] = useState(profile?.hierarchy_level?.toString() ?? '');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  const needsCompletion = !profile?.profile_completed || !profile?.employee_id;
  const email = profile?.email ?? user?.email ?? '';

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

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setRole(profile.role ?? '');
    setDepartment(profile.department ?? '');
    setSubsidiaryId(profile.subsidiary_id ?? '');
    setHierarchyLevel(profile.hierarchy_level?.toString() ?? '');
  }, [profile]);

  useEffect(() => {
    const matched = employees.find((employee) => employee.email?.trim().toLowerCase() === email.trim().toLowerCase());
    if (!matched) return;
    setName((current) => current || matched.name || '');
    setRole((current) => current || matched.role || '');
    setDepartment((current) => current || matched.department || '');
    setSubsidiaryId((current) => current || matched.subsidiary_id || '');
    setHierarchyLevel((current) => current || matched.hierarchy_level?.toString() || '');
  }, [email, employees]);

  const departmentOptions = useMemo(
    () => uniqueSorted([...employees.map((employee) => employee.department), ...FALLBACK_DEPARTMENTS]),
    [employees],
  );

  const roleOptions = useMemo(
    () => uniqueSorted([...employees.map((employee) => employee.role), ...FALLBACK_ROLES]),
    [employees],
  );

  const profileHierarchyLowerSenior = useMemo(
    () => subsidiaries.find((s) => s.id === subsidiaryId)?.hierarchy_lower_is_senior ?? false,
    [subsidiaries, subsidiaryId],
  );

  const canSave = name.trim() && role.trim() && department.trim() && subsidiaryId && hierarchyLevel;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) {
      toast.error('Please complete every profile field.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.functions.invoke('complete-profile', {
      body: {
        name,
        role,
        department,
        subsidiary_id: subsidiaryId,
        hierarchy_level: Number(hierarchyLevel),
      },
    });
    setSaving(false);

    if (error) {
      toast.error(error.message || 'Profile could not be completed.');
      return;
    }

    await refreshProfile();
    toast.success('Profile completed. You can now continue.');
  };

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
              <img src={vggLogo} alt="VGG" className="h-8 w-auto" />
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
                    <Label>Subsidiary</Label>
                    <Select value={subsidiaryId} onValueChange={setSubsidiaryId}>
                      <SelectTrigger><SelectValue placeholder="Select subsidiary" /></SelectTrigger>
                      <SelectContent>
                        {subsidiaries.map((subsidiary) => <SelectItem key={subsidiary.id} value={subsidiary.id}>{subsidiary.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-department">Department</Label>
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-role">Role / title</Label>
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
                  </div>

                  <div className="space-y-2">
                    <Label>Seniority level</Label>
                    <Select value={hierarchyLevel} onValueChange={setHierarchyLevel}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        {HIERARCHY_LEVEL_VALUES.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            L{value} — {displayHierarchyLabel(value, profileHierarchyLowerSenior)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <p>Your confirmed details are used only to place reviews into the right subsidiary, department, and hierarchy pools. You can pick from the list or type your own value.</p>
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
