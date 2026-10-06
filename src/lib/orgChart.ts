import { coverageLabels } from '@/lib/personCoverage';

export type OrgPerson = {
  id: string;
  name: string;
  role: string | null;
  additional_roles?: string[] | null;
  department: string | null;
  additional_departments?: string[] | null;
  hierarchy_level: number | null;
  manager_id: string | null;
  secondary_manager_id: string | null;
};

export type OrgNode = {
  person: OrgPerson;
  children: OrgNode[];
};

export function isVacantSeat(name: string | null | undefined): boolean {
  return /\(vacant\)/i.test(name ?? '');
}

/** Lower rank sorts first when that direction is more senior. */
function seniorityRank(level: number | null, lowerIsSenior: boolean): number {
  if (level == null || Number.isNaN(level)) return lowerIsSenior ? 10_000 : -10_000;
  return lowerIsSenior ? level : -level;
}

function bySeniorityThenName(lowerIsSenior: boolean) {
  return (a: OrgPerson, b: OrgPerson) => {
    const rank = seniorityRank(a.hierarchy_level, lowerIsSenior) - seniorityRank(b.hierarchy_level, lowerIsSenior);
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name);
  };
}

/**
 * Reporting tree. Each person appears once, under their primary manager.
 * A manager outside this roster starts a new root. A reporting loop keeps the
 * most senior person in that loop as the root so the chart still renders.
 */
export function buildOrgForest(people: OrgPerson[], lowerIsSenior: boolean): OrgNode[] {
  const roster = people.filter((person) => person.id && !isVacantSeat(person.name));
  const byId = new Map(roster.map((person) => [person.id, person]));
  const sortPeople = bySeniorityThenName(lowerIsSenior);

  const climb = (start: OrgPerson): OrgPerson => {
    const seen = new Set<string>();
    let current = start;
    while (true) {
      const managerId = current.manager_id;
      if (!managerId || managerId === current.id || !byId.has(managerId)) return current;
      if (seen.has(current.id)) {
        return [...seen].map((id) => byId.get(id)!).sort(sortPeople)[0] ?? current;
      }
      seen.add(current.id);
      current = byId.get(managerId)!;
    }
  };

  const rootIds = new Set(roster.map((person) => climb(person).id));
  const childrenOf = new Map<string, OrgPerson[]>();
  for (const person of roster) {
    const managerId = person.manager_id;
    if (!managerId || managerId === person.id || !byId.has(managerId)) continue;
    const list = childrenOf.get(managerId) ?? [];
    list.push(person);
    childrenOf.set(managerId, list);
  }

  const build = (person: OrgPerson, stack: Set<string>): OrgNode => {
    const next = new Set(stack);
    next.add(person.id);
    const children = (childrenOf.get(person.id) ?? [])
      .filter((child) => !next.has(child.id))
      .sort(sortPeople)
      .map((child) => build(child, next));
    return { person, children };
  };

  return [...rootIds]
    .map((id) => byId.get(id)!)
    .sort(sortPeople)
    .map((person) => build(person, new Set()));
}

/** Most senior person first, ending with the viewer. Stops on a cycle. */
export function seniorityChain(people: OrgPerson[], viewerId: string | null | undefined): OrgPerson[] {
  if (!viewerId) return [];
  const byId = new Map(people.filter((person) => !isVacantSeat(person.name)).map((person) => [person.id, person]));
  const upward: OrgPerson[] = [];
  const seen = new Set<string>();
  let current = byId.get(viewerId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    upward.push(current);
    const managerId = current.manager_id;
    current = managerId && managerId !== current.id ? byId.get(managerId) : undefined;
  }
  return upward.reverse();
}

export function personTeams(person: Pick<OrgPerson, 'department' | 'additional_departments'>): string[] {
  return coverageLabels(person.department, person.additional_departments);
}

export function personRoles(person: Pick<OrgPerson, 'role' | 'additional_roles'>): string[] {
  return coverageLabels(person.role, person.additional_roles);
}
