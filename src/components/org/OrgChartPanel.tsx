import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Network } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { displayHierarchyLabel } from '@/lib/hierarchyConvention';
import { buildOrgForest, personRoles, personTeams, seniorityChain, type OrgNode, type OrgPerson } from '@/lib/orgChart';
import { asStringList } from '@/lib/personCoverage';
import { resolveMonthPeriod, resolveQuarterPeriod } from '@/lib/boomPeriods';
import { ghcGetDirectory } from '@/modules/ghc/ghcApi';
import { useTenant } from '@/tenants/TenantContext';
import { isGhcStyleAppraisal } from '@/tenants/config';
import { cn } from '@/lib/utils';

function toPerson(row: Record<string, unknown>): OrgPerson | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const name = typeof row.name === 'string' ? row.name : '';
  if (!id || !name) return null;
  const level = row.hierarchy_level;
  return {
    id,
    name,
    role: typeof row.role === 'string' ? row.role : null,
    additional_roles: asStringList(row.additional_roles),
    department: typeof row.department === 'string' ? row.department : null,
    additional_departments: asStringList(row.additional_departments),
    hierarchy_level: typeof level === 'number' ? level : level == null ? null : Number(level),
    manager_id: typeof row.manager_id === 'string' ? row.manager_id : null,
    secondary_manager_id: typeof row.secondary_manager_id === 'string' ? row.secondary_manager_id : null,
  };
}

export function OrgChartView({
  people,
  viewerId,
  lowerIsSenior,
  appraisalMode,
  subsidiaryId,
}: {
  people: OrgPerson[];
  viewerId?: string | null;
  lowerIsSenior: boolean;
  appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy';
  subsidiaryId?: string | null;
}) {
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const forest = useMemo(() => buildOrgForest(people, lowerIsSenior), [people, lowerIsSenior]);
  const chain = useMemo(() => seniorityChain(people, viewerId), [people, viewerId]);
  const labelOpts = { appraisalMode, subsidiaryId };

  const levelLabel = (level: number | null) => displayHierarchyLabel(level, lowerIsSenior, labelOpts);

  if (!people.length) {
    return (
      <div className="rounded-3xl bg-white p-5 text-sm text-muted-foreground shadow-sm ring-1 ring-black/5">
        No one is on this company roster yet.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
      <div>
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Network className="h-4 w-4 text-teal-700" />
          Organizational chart
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordered by the seniority chain. Each person sits under the manager they report to.
        </p>
      </div>

      {chain.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Your seniority chain</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5">
            {chain.map((person, index) => {
              const mine = person.id === viewerId;
              return (
                <li key={person.id} className="flex items-center gap-1.5">
                  {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[12.5px] font-medium',
                      mine ? 'bg-teal-600 text-white' : 'bg-muted text-foreground',
                    )}
                  >
                    {person.name}
                    <span className={cn('ml-1.5 font-normal', mine ? 'text-teal-50' : 'text-muted-foreground')}>
                      {levelLabel(person.hierarchy_level)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <ul className="space-y-3">
        {forest.map((node) => (
          <TreeBranch
            key={node.person.id}
            node={node}
            viewerId={viewerId}
            byId={byId}
            levelLabel={levelLabel}
          />
        ))}
      </ul>
    </section>
  );
}

function TreeBranch({
  node,
  viewerId,
  byId,
  levelLabel,
}: {
  node: OrgNode;
  viewerId?: string | null;
  byId: Map<string, OrgPerson>;
  levelLabel: (level: number | null) => string;
}) {
  const { person } = node;
  const mine = person.id === viewerId;
  const roles = personRoles(person);
  const teams = personTeams(person);
  const second = person.secondary_manager_id ? byId.get(person.secondary_manager_id) : undefined;

  return (
    <li className="list-none">
      <article
        className={cn(
          'rounded-2xl border bg-muted/20 px-3 py-2.5',
          mine ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200' : 'border-border',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">
            {person.name}
            {mine && <span className="ml-2 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white">You</span>}
          </p>
          <p className="text-[12px] text-muted-foreground">{levelLabel(person.hierarchy_level)}</p>
        </div>
        <p className="mt-0.5 text-[13px] text-foreground/80">
          {roles.length ? roles.join(' · ') : 'Role not set'}
          {teams.length ? ` · ${teams.join(' & ')}` : ''}
        </p>
        {second && second.id !== person.manager_id && (
          <p className="mt-1 text-[12px] text-muted-foreground">Also reports to {second.name}</p>
        )}
      </article>
      {node.children.length > 0 && (
        <ul className="ml-3 mt-2 space-y-2 border-l border-border pl-3 sm:ml-5 sm:pl-4">
          {node.children.map((child) => (
            <TreeBranch key={child.person.id} node={child} viewerId={viewerId} byId={byId} levelLabel={levelLabel} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CompanyOrgChart({ viewerId }: { viewerId?: string | null }) {
  const { tenant } = useTenant();
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let rows: Record<string, unknown>[] = [];
        if (isGhcStyleAppraisal(tenant)) {
          const data = await ghcGetDirectory(resolveQuarterPeriod(null), resolveMonthPeriod(null));
          rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
        } else if (tenant.subsidiaryId) {
          const db = supabase as any;
          const full = await db
            .from('employees')
            .select('id, name, role, department, additional_roles, additional_departments, hierarchy_level, manager_id, secondary_manager_id')
            .eq('subsidiary_id', tenant.subsidiaryId)
            .order('name');
          const basic = full.error
            ? await db
                .from('employees')
                .select('id, name, role, department, hierarchy_level, manager_id, secondary_manager_id')
                .eq('subsidiary_id', tenant.subsidiaryId)
                .order('name')
            : full;
          if (basic.error) throw basic.error;
          rows = (basic.data ?? []) as Record<string, unknown>[];
        }
        if (!cancelled) {
          setPeople(rows.map(toPerson).filter((person): person is OrgPerson => !!person));
        }
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.appraisalMode, tenant.slug, tenant.subsidiaryId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-3xl bg-white px-5 py-8 text-sm text-muted-foreground shadow-sm ring-1 ring-black/5">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading organizational chart…
      </div>
    );
  }

  return (
    <OrgChartView
      people={people}
      viewerId={viewerId}
      lowerIsSenior={tenant.appraisalMode !== 'legacy'}
      appraisalMode={tenant.appraisalMode}
      subsidiaryId={tenant.subsidiaryId}
    />
  );
}
