import { describe, expect, it } from 'vitest';
import { formatRoles, formatTeams } from './personCoverage';
import { buildOrgForest, seniorityChain, type OrgPerson } from './orgChart';

const greenhouse: OrgPerson[] = [
  { id: 'bunmi', name: 'Bunmi Akinyemiju', role: 'CEO', department: 'Executive', hierarchy_level: 1, manager_id: null, secondary_manager_id: null },
  {
    id: 'uloma',
    name: 'Uloma Herrington',
    role: 'Head of Legal & Operations',
    department: 'Legal',
    additional_departments: ['Operations'],
    hierarchy_level: 2,
    manager_id: 'bunmi',
    secondary_manager_id: null,
  },
  { id: 'busayo', name: 'Busayo Eniola-Giwa', role: 'Investment Lead', department: 'Investment', hierarchy_level: 3, manager_id: 'uloma', secondary_manager_id: null },
  { id: 'omotola', name: 'Omotola Akinyemiju', role: 'Finance Lead', department: 'Finance', hierarchy_level: 3, manager_id: 'uloma', secondary_manager_id: null },
  { id: 'phebean', name: 'Phebean Falaye', role: 'Operations Lead', department: 'Operations', hierarchy_level: 3, manager_id: 'uloma', secondary_manager_id: null },
  { id: 'fiyin', name: 'Fiyinfoluwa Sanwo', role: 'People Ops', department: 'People Ops', hierarchy_level: 3, manager_id: 'uloma', secondary_manager_id: null },
  { id: 'mariam', name: 'Mariam Adahunse', role: 'Analyst', department: 'Investment', hierarchy_level: 3, manager_id: 'busayo', secondary_manager_id: 'omotola' },
  { id: 'faith', name: 'Faith Aminaho', role: 'Associate', department: 'Operations', hierarchy_level: 4, manager_id: 'phebean', secondary_manager_id: null },
  { id: 'anjola', name: 'Anjolaoluwa Jawando', role: 'Associate', department: 'Finance', hierarchy_level: 4, manager_id: 'omotola', secondary_manager_id: null },
  { id: 'vacant', name: 'HR Intern (vacant)', role: 'HR Intern', department: 'People Ops', hierarchy_level: 4, manager_id: 'fiyin', secondary_manager_id: null },
];

describe('person coverage', () => {
  it('joins every team a person covers', () => {
    expect(formatTeams('Legal', ['Operations', 'legal'])).toBe('Legal & Operations');
  });

  it('joins extra titles without repeating the primary', () => {
    expect(formatRoles('Head of Legal', ['Head of Operations'])).toBe('Head of Legal · Head of Operations');
  });
});

describe('org chart', () => {
  const forest = buildOrgForest(greenhouse, true);

  it('puts the most senior person at the root and Uloma over both Legal and Operations lines', () => {
    expect(forest.map((node) => node.person.id)).toEqual(['bunmi']);
    const uloma = forest[0].children[0];
    expect(uloma.person.id).toBe('uloma');
    expect(uloma.children.map((child) => child.person.id)).toEqual(['busayo', 'fiyin', 'omotola', 'phebean']);
    expect(uloma.children.find((child) => child.person.id === 'phebean')?.children.map((child) => child.person.id)).toEqual(['faith']);
  });

  it('keeps a person with two managers on the primary chain only', () => {
    const busayo = forest[0].children[0].children.find((child) => child.person.id === 'busayo');
    expect(busayo?.children.map((child) => child.person.id)).toEqual(['mariam']);
    const omotola = forest[0].children[0].children.find((child) => child.person.id === 'omotola');
    expect(omotola?.children.map((child) => child.person.id)).toEqual(['anjola']);
  });

  it('leaves vacant seats off the chart', () => {
    const ids = JSON.stringify(forest);
    expect(ids).not.toContain('vacant');
  });

  it('walks the seniority chain from the top down to the viewer', () => {
    expect(seniorityChain(greenhouse, 'faith').map((person) => person.name)).toEqual([
      'Bunmi Akinyemiju',
      'Uloma Herrington',
      'Phebean Falaye',
      'Faith Aminaho',
    ]);
  });

  it('stops when a reporting line loops', () => {
    const loop: OrgPerson[] = [
      { id: 'a', name: 'A', role: null, department: null, hierarchy_level: 1, manager_id: 'b', secondary_manager_id: null },
      { id: 'b', name: 'B', role: null, department: null, hierarchy_level: 2, manager_id: 'a', secondary_manager_id: null },
    ];
    const forest = buildOrgForest(loop, true);
    expect(forest).toHaveLength(1);
    expect(forest[0].children).toHaveLength(1);
    expect(forest[0].children[0].children).toHaveLength(0);
    expect(seniorityChain(loop, 'b').map((person) => person.id)).toEqual(['a', 'b']);
  });
});
