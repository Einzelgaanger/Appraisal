import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, User, Users } from 'lucide-react';
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

const db = supabase as any;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

type Props = {
  companyName: string | null;
  employeeRole: string | null;
  employeeDepartment: string | null;
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
  employeeDepartment,
  employeeName,
  onSaved,
}: Props) {
  const { user, profile, refreshProfile } = useEmployeeAuth();
  const { tenant } = useTenant();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [teammates, setTeammates] = useState<WorkspaceColleague[]>([]);
  const [teammatesLoading, setTeammatesLoading] = useState(true);

  const ghc = isGhcTenant(tenant);
  const ghcStyle = isGhcStyleAppraisal(tenant);

  useEffect(() => {
    setName(employeeName || profile?.name || '');
    setRole(employeeRole || profile?.role || '');
    setDepartment(employeeDepartment || profile?.department || '');
    setAvatarUrl((profile as { avatar_url?: string | null } | null)?.avatar_url ?? null);
  }, [employeeName, employeeRole, employeeDepartment, profile]);

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
    if (current && !base.some((d) => d.toLowerCase() === current.toLowerCase())) base.unshift(current);
    return base;
  }, [ghc, ghcStyle, department]);

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
      setAvatarUrl(url);
      toast.success('Photo added. Save to keep it.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !role.trim()) {
      toast.error('Name and role are required.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await db.rpc('update_my_profile', {
        _name: name.trim(),
        _role: role.trim(),
        _department: department.trim() || null,
        _avatar_url: avatarUrl,
      });
      if (error) throw error;
      await refreshProfile();
      onSaved?.();
      toast.success('Profile saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const myId = profile?.employee_id ?? null;

  return (
    <div className="space-y-4">
    <div className="surface-card p-5 sm:p-6 space-y-6 max-w-xl">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ My profile</p>
        <h2 className="font-display text-2xl font-medium mt-1">How you appear</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your name, role, and photo. Email and company stay as People Ops set them.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative group"
          aria-label="Change profile photo"
        >
          <Avatar className="h-20 w-20 border border-border">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
            <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            {uploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
        <div>
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG or WebP · under 2 MB</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload photo'}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void handlePhoto(e.target.files?.[0])}
        />
      </div>

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-role">Role</Label>
          {ghc ? (
            <Select value={role || undefined} onValueChange={setRole}>
              <SelectTrigger id="profile-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="profile-role" value={role} onChange={(e) => setRole(e.target.value)} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-dept">Department</Label>
          {departmentOptions.length > 0 ? (
            <Select value={department || undefined} onValueChange={setDepartment}>
              <SelectTrigger id="profile-dept">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="profile-dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={profile?.email ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-company">Company</Label>
          <Input id="profile-company" value={companyName ?? ''} disabled readOnly />
        </div>
      </div>

      <Button onClick={() => void handleSave()} disabled={saving || uploading} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
        Save profile
      </Button>
    </div>

    <div className="surface-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Teammates</p>
          <h2 className="font-display text-xl font-medium mt-1">
            {companyName ? `People at ${companyName}` : 'Your company'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {teammates.length} {teammates.length === 1 ? 'person' : 'people'} in this company, grouped by department.
          </p>
        </div>
      </div>

      {teammatesLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading teammates…
        </div>
      ) : teammates.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No teammates found for this company yet.</p>
      ) : (
        <div className="space-y-5">
          {teammatesByDept.map(([dept, people]) => (
            <div key={dept}>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
                {dept} · {people.length}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {people.map((person) => {
                  const mine = person.id === myId;
                  return (
                    <li
                      key={person.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        mine ? 'border-primary/30 bg-primary/5' : 'border-border/60'
                      }`}
                    >
                      <Avatar className="h-9 w-9 border border-border">
                        {person.avatar_url ? <AvatarImage src={person.avatar_url} alt={person.name} /> : null}
                        <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {person.name}
                          {mine ? <span className="text-muted-foreground font-normal"> · you</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{person.role || 'No role set'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
