import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Building2,
  Camera,
  CircleUserRound,
  Loader2,
  Mail,
  Save,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useTenant } from '@/tenants/TenantContext';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  GHC_DEPARTMENTS,
  GHC_ROLES,
  VIGIPAY_DEPARTMENTS,
} from '@/lib/hierarchyConvention';
import { isGhcStyleAppraisal, isGhcTenant } from '@/tenants/config';
import { companyDirectory, type WorkspaceColleague } from '@/modules/workspace/workspaceApi';
import { asStringList, extrasExcept, formatRoles, formatTeams } from '@/lib/personCoverage';
import CoverageEditor from '@/components/org/CoverageEditor';
import { cn } from '@/lib/utils';

function thrownMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function profileRpcMissing(message: string): boolean {
  return /could not find the function|schema cache|PGRST202/i.test(message);
}

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-700',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-700',
];

const DEPT_TONES = [
  'bg-teal-100 text-teal-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-orange-100 text-orange-800',
];

function toneFor(seed: string, tones: string[]) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n += seed.charCodeAt(i);
  return tones[n % tones.length];
}

const db = supabase as any;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

type Props = {
  companyName: string | null;
  employeeRole: string | null;
  employeeAdditionalRoles?: string[] | null;
  employeeDepartment: string | null;
  employeeAdditionalDepartments?: string[] | null;
  employeeName: string | null;
  onSaved?: () => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'ME';
}

export default function MyProfilePanel({
  companyName,
  employeeRole,
  employeeAdditionalRoles,
  employeeDepartment,
  employeeAdditionalDepartments,
  employeeName,
  onSaved,
}: Props) {
  const { user, profile, refreshProfile } = useEmployeeAuth();
  const { tenant } = useTenant();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [extraRoles, setExtraRoles] = useState<string[]>([]);
  const [department, setDepartment] = useState('');
  const [extraDepartments, setExtraDepartments] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pendingAvatar = useRef<string | null>(null);
  const seeded = useRef(false);
  const [teammates, setTeammates] = useState<WorkspaceColleague[]>([]);
  const [teammatesLoading, setTeammatesLoading] = useState(true);

  const ghc = isGhcTenant(tenant);
  const ghcStyle = isGhcStyleAppraisal(tenant);

  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setName(employeeName || profile.name || '');
    setRole(employeeRole || profile.role || '');
    setExtraRoles(extrasExcept(employeeRole || profile.role, asStringList(employeeAdditionalRoles)));
    setDepartment(employeeDepartment || profile.department || '');
    setExtraDepartments(extrasExcept(employeeDepartment || profile.department, asStringList(employeeAdditionalDepartments)));
    setAvatarUrl(profile.avatar_url ?? null);
  }, [employeeName, employeeRole, employeeAdditionalRoles, employeeDepartment, employeeAdditionalDepartments, profile]);

  useEffect(() => {
    const saved = profile?.avatar_url ?? null;
    if (pendingAvatar.current && pendingAvatar.current !== saved) return;
    pendingAvatar.current = null;
    setAvatarUrl(saved);
  }, [profile?.avatar_url]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTeammatesLoading(true);
      try {
        const people = await companyDirectory();
        if (!cancelled) setTeammates(people);
      } catch {
        if (!cancelled) setTeammates([]);
      } finally {
        if (!cancelled) setTeammatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teammatesByDept = useMemo(() => {
    const groups = new Map<string, WorkspaceColleague[]>();
    for (const person of teammates) {
      const key = (person.department || 'Unassigned').trim() || 'Unassigned';
      const list = groups.get(key) || [];
      list.push(person);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [teammates]);

  const departmentOptions = useMemo(() => {
    const current = department.trim();
    const base = ghc ? [...GHC_DEPARTMENTS] : ghcStyle ? [...VIGIPAY_DEPARTMENTS] : [];
    for (const person of teammates) {
      for (const team of [person.department, ...(person.additional_departments ?? [])]) {
        const label = team?.trim();
        if (label && !base.some((item) => item.toLowerCase() === label.toLowerCase())) base.push(label);
      }
    }
    if (current && !base.some((d) => d.toLowerCase() === current.toLowerCase())) base.unshift(current);
    return base;
  }, [ghc, ghcStyle, department, teammates]);

  const roleOptions = useMemo(() => {
    const current = role.trim();
    const base = ghc ? [...GHC_ROLES] : [];
    if (current && !base.some((r) => r.toLowerCase() === current.toLowerCase())) base.unshift(current);
    return base;
  }, [ghc, role]);

  const handlePhoto = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Keep the photo under 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      pendingAvatar.current = url;
      setAvatarUrl(url);
      await persistProfile(url);
      toast.success('Photo saved');
    } catch (e) {
      toast.error(thrownMessage(e, 'Could not upload photo'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const persistProfile = async (nextAvatar: string | null) => {
    const cleanName = (name.trim() || employeeName || profile?.name || '').trim();
    const cleanRole = (role.trim() || employeeRole || profile?.role || '').trim();
    if (cleanName.length < 2 || cleanRole.length < 2) {
      throw new Error('Name and role are required before this can be saved.');
    }
    const base = {
      _name: cleanName,
      _role: cleanRole,
      _department: (department.trim() || employeeDepartment || profile?.department || '').trim() || null,
      _avatar_url: nextAvatar,
    };
    const payload = {
      ...base,
      _additional_departments: extrasExcept(department, extraDepartments),
      _additional_roles: extrasExcept(role, extraRoles),
    };
    let { error } = await db.rpc('update_my_profile', payload);
    if (error && profileRpcMissing(error.message ?? '')) {
      ({ error } = await db.rpc('update_my_profile', base));
    }
    if (error) throw new Error(error.message || 'Could not save profile');
    await refreshProfile();
    pendingAvatar.current = null;
    onSaved?.();
  };

  const handleSave = async () => {
    if (!name.trim() || !role.trim()) {
      toast.error('Name and role are required.');
      return;
    }
    setSaving(true);
    try {
      await persistProfile(avatarUrl);
      toast.success('Profile saved');
    } catch (e) {
      toast.error(thrownMessage(e, 'Could not save profile'));
    } finally {
      setSaving(false);
    }
  };

  const myId = profile?.employee_id ?? null;

  const fieldClass = 'h-11 rounded-2xl border-border/80 bg-white px-3.5 shadow-sm';
  const lockedClass = 'disabled:opacity-100 disabled:bg-muted/50 disabled:text-foreground/80';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 rounded-3xl bg-gradient-to-b from-rose-50 via-orange-50/70 to-amber-50/40 p-5 shadow-sm ring-1 ring-rose-100 sm:flex-row sm:items-center lg:sticky lg:top-6 lg:row-span-2 lg:block lg:p-6">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative h-24 w-24 shrink-0 self-start overflow-hidden rounded-full ring-4 ring-white lg:h-32 lg:w-32"
          aria-label="Change profile photo"
        >
          <Avatar className="h-full w-full">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
            <AvatarFallback className={cn('text-2xl font-semibold lg:text-3xl', toneFor(name || 'me', AVATAR_TONES))}>
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-rose-950/45 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
        <h2 className="font-display text-[22px] font-semibold leading-tight text-foreground lg:mt-4">
          {name.trim() || 'Your name'}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {role.trim() ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[12px] font-medium text-amber-800">
              <Briefcase className="h-3.5 w-3.5" />
              {formatRoles(role, extraRoles, '')}
            </span>
          ) : null}
          {department.trim() || extraDepartments.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-[12px] font-medium text-teal-800">
              <Users className="h-3.5 w-3.5" />
              {formatTeams(department, extraDepartments, '')}
            </span>
          ) : null}
        </div>
        <div className="mt-4 space-y-2 text-[13px] text-foreground/75">
          <p className="flex items-start gap-2">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            <span className="break-all">{profile?.email || 'No email yet'}</span>
          </p>
          <p className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <span>{companyName || 'No company yet'}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-5 h-9 rounded-full border-rose-200 bg-white px-4 font-sans text-[13px] font-medium normal-case tracking-normal text-rose-700 hover:bg-rose-100 hover:text-rose-800"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload photo'}
        </Button>
        <p className="mt-2 text-[12px] text-muted-foreground">JPG, PNG, or WebP, under 2 MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void handlePhoto(e.target.files?.[0])}
        />
      </aside>

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 lg:col-start-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[22px] font-semibold leading-tight text-foreground">How you appear</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              The card on the left updates as you type. Email and company stay as People Ops set them.
            </p>
          </div>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || uploading}
            className="h-11 gap-2 rounded-2xl bg-rose-500 px-5 font-sans text-sm font-medium normal-case tracking-normal text-white hover:bg-rose-600"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save profile
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ProfileField id="profile-name" label="Name" icon={CircleUserRound} chip="rounded-lg bg-violet-100 text-violet-700">
            <Input id="profile-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </ProfileField>
          <ProfileField id="profile-role" label="Role" icon={Briefcase} chip="rounded-md bg-amber-100 text-amber-800">
            {ghc ? (
              <Select value={role || undefined} onValueChange={setRole}>
                <SelectTrigger id="profile-role" className={fieldClass}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="profile-role" className={fieldClass} value={role} onChange={(e) => setRole(e.target.value)} />
            )}
          </ProfileField>
          <ProfileField id="profile-dept" label="Department" icon={Users} chip="rounded-full bg-teal-100 text-teal-800">
            {departmentOptions.length > 0 ? (
              <Select value={department || undefined} onValueChange={setDepartment}>
                <SelectTrigger id="profile-dept" className={fieldClass}>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="profile-dept" className={fieldClass} value={department} onChange={(e) => setDepartment(e.target.value)} />
            )}
          </ProfileField>
          <CoverageEditor
            primaryDepartment={department}
            primaryRole={role}
            departmentOptions={departmentOptions}
            roleOptions={roleOptions}
            extraDepartments={extraDepartments}
            extraRoles={extraRoles}
            onDepartments={setExtraDepartments}
            onRoles={setExtraRoles}
          />
          <ProfileField id="profile-company" label="Company" hint="Set by People Ops" icon={Building2} chip="rounded-[10px] bg-indigo-100 text-indigo-700">
            <Input id="profile-company" className={cn(fieldClass, lockedClass)} value={companyName ?? ''} disabled readOnly />
          </ProfileField>
          <ProfileField id="profile-email" label="Email" hint="Set by People Ops" icon={Mail} chip="rounded-xl bg-sky-100 text-sky-700" className="sm:col-span-2">
            <Input id="profile-email" className={cn(fieldClass, lockedClass)} value={profile?.email ?? ''} disabled readOnly />
          </ProfileField>
        </div>
      </section>

      <section className="space-y-5 rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 lg:col-start-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <Users className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                {companyName ? `People at ${companyName}` : 'Your company'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {teammates.length} {teammates.length === 1 ? 'person' : 'people'}, grouped by department.
              </p>
            </div>
          </div>
        </div>

        {teammatesLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading teammates…
          </div>
        ) : teammates.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No teammates found for this company yet.</p>
        ) : (
          <div className="space-y-5">
            {teammatesByDept.map(([dept, people]) => (
              <div key={dept}>
                <p className={cn('mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-medium', toneFor(dept, DEPT_TONES))}>
                  {dept}
                  <span className="ml-1.5 opacity-70">{people.length}</span>
                </p>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((person) => {
                    const mine = person.id === myId;
                    return (
                      <li
                        key={person.id}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                          mine ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-muted/40',
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          {person.avatar_url ? <AvatarImage src={person.avatar_url} alt={person.name} /> : null}
                          <AvatarFallback className={cn('text-xs font-semibold', toneFor(person.name, AVATAR_TONES))}>
                            {initials(person.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {person.name}
                            {mine ? <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">You</span> : null}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {formatRoles(person.role, person.additional_roles, 'No role set')}
                            {' · '}
                            {formatTeams(person.department, person.additional_departments, 'No team')}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileField({
  id,
  label,
  hint,
  icon: Icon,
  chip,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  chip: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center', chip)}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div>
          <Label htmlFor={id} className="text-[14px] font-medium tracking-normal">{label}</Label>
          {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
