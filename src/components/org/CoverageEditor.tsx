import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { extrasExcept } from '@/lib/personCoverage';
import { cn } from '@/lib/utils';

function toggle(list: string[], value: string) {
  const key = value.toLowerCase();
  return list.some((item) => item.toLowerCase() === key)
    ? list.filter((item) => item.toLowerCase() !== key)
    : [...list, value];
}

export default function CoverageEditor({
  primaryDepartment,
  primaryRole,
  departmentOptions,
  roleOptions,
  extraDepartments,
  extraRoles,
  onDepartments,
  onRoles,
}: {
  primaryDepartment: string;
  primaryRole: string;
  departmentOptions: string[];
  roleOptions: string[];
  extraDepartments: string[];
  extraRoles: string[];
  onDepartments: (next: string[]) => void;
  onRoles: (next: string[]) => void;
}) {
  const [teamDraft, setTeamDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const teams = extrasExcept(primaryDepartment, extraDepartments);
  const roles = extrasExcept(primaryRole, extraRoles);
  const teamChoices = departmentOptions.filter(
    (option) => option.toLowerCase() !== primaryDepartment.trim().toLowerCase(),
  );
  const roleChoices = roleOptions.filter(
    (option) => option.toLowerCase() !== primaryRole.trim().toLowerCase(),
  );

  const addTeam = () => {
    const next = teamDraft.trim();
    if (!next) return;
    onDepartments(extrasExcept(primaryDepartment, [...teams, next]));
    setTeamDraft('');
  };

  const addRole = () => {
    const next = roleDraft.trim();
    if (!next) return;
    onRoles(extrasExcept(primaryRole, [...roles, next]));
    setRoleDraft('');
  };

  return (
    <div className="space-y-4 rounded-2xl bg-muted/30 p-3 sm:col-span-2">
      <div className="space-y-2">
        <p className="text-sm font-medium">Also covers</p>
        <p className="text-[12.5px] text-muted-foreground">
          Use this when one person leads more than one team, the way Legal and Operations can sit with the same manager.
        </p>
        {teamChoices.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {teamChoices.map((option) => {
              const on = teams.some((team) => team.toLowerCase() === option.toLowerCase());
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDepartments(toggle(teams, option))}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[12.5px] font-medium ring-1',
                    on ? 'bg-teal-600 text-white ring-teal-600' : 'bg-white text-foreground ring-border',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={teamDraft}
            onChange={(event) => setTeamDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTeam();
              }
            }}
            placeholder="Add another team"
            className="h-9 rounded-xl"
            maxLength={80}
          />
          <button type="button" onClick={addTeam} className="rounded-xl bg-white px-3 text-sm font-medium ring-1 ring-border">
            Add
          </button>
        </div>
        {teams.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {teams.map((team) => (
              <li key={team}>
                <button
                  type="button"
                  onClick={() => onDepartments(teams.filter((item) => item !== team))}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-[12px] font-medium text-teal-800"
                >
                  {team}
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {team}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Also holds</p>
        <p className="text-[12.5px] text-muted-foreground">Add another title when the primary role does not cover the whole job.</p>
        {roleChoices.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {roleChoices.map((option) => {
              const on = roles.some((role) => role.toLowerCase() === option.toLowerCase());
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onRoles(toggle(roles, option))}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[12.5px] font-medium ring-1',
                    on ? 'bg-amber-600 text-white ring-amber-600' : 'bg-white text-foreground ring-border',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={roleDraft}
            onChange={(event) => setRoleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRole();
              }
            }}
            placeholder="Add another role"
            className="h-9 rounded-xl"
            maxLength={80}
          />
          <button type="button" onClick={addRole} className="rounded-xl bg-white px-3 text-sm font-medium ring-1 ring-border">
            Add
          </button>
        </div>
        {roles.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => onRoles(roles.filter((item) => item !== role))}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[12px] font-medium text-amber-900"
                >
                  {role}
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {role}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
