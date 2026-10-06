import { useEffect, useMemo, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ghcGetDirectory } from './ghcApi';
import { displayHierarchyLabel } from '@/lib/hierarchyConvention';
import { asStringList, formatRoles, formatTeams } from '@/lib/personCoverage';
import { type OrgPerson } from '@/lib/orgChart';
import { OrgChartView } from '@/components/org/OrgChartPanel';
import { useTenant } from '@/tenants/TenantContext';

type Row = {
  id: string;
  name: string;
  role: string | null;
  additional_roles?: string[] | null;
  department: string | null;
  additional_departments?: string[] | null;
  hierarchy_level: number | null;
  manager_id: string | null;
  secondary_manager_id: string | null;
  monthly_self_done?: boolean;
  monthly_done: boolean;
  peer_360_given?: number;
  peer_360_expected?: number;
  peer_360_count: number;
  eval_done: boolean;
};

export default function GhcDirectoryPanel({
  periodQuarter,
  periodMonth,
  viewerEmployeeId,
}: {
  periodQuarter: string;
  periodMonth: string;
  viewerEmployeeId?: string | null;
}) {
  const { tenant } = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [onlyReports, setOnlyReports] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      startLoading();
      try {
        const data = await ghcGetDirectory(periodQuarter, periodMonth);
        if (!cancelled) setRows(data as Row[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) finishLoading();
      }
    })();
    return () => { cancelled = true; };
  }, [finishLoading, periodQuarter, periodMonth, startLoading]);

  const myReports = useMemo(() => {
    if (!viewerEmployeeId) return [];
    return rows.filter(
      (r) => r.manager_id === viewerEmployeeId || r.secondary_manager_id === viewerEmployeeId,
    );
  }, [rows, viewerEmployeeId]);

  const visible = onlyReports && viewerEmployeeId ? myReports : rows;
  const chartPeople = useMemo<OrgPerson[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        additional_roles: asStringList(row.additional_roles),
        department: row.department,
        additional_departments: asStringList(row.additional_departments),
        hierarchy_level: row.hierarchy_level,
        manager_id: row.manager_id,
        secondary_manager_id: row.secondary_manager_id,
      })),
    [rows],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading directory…
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <OrgChartView
      people={chartPeople}
      viewerId={viewerEmployeeId}
      lowerIsSenior
      appraisalMode={tenant.appraisalMode}
      subsidiaryId={tenant.subsidiaryId}
    />
    <div className="glass-panel p-5 overflow-x-auto space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{tenant.branding.fullName} directory &amp; completion</h3>
          <p className="text-xs text-muted-foreground">
            Month {periodMonth} · Quarter {periodQuarter} — Self check-in + 360 given (done / expected)
          </p>
        </div>
        {myReports.length > 0 && (
          <Button
            size="sm"
            variant={onlyReports ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setOnlyReports((v) => !v)}
          >
            {onlyReports ? `Your reports (${myReports.length})` : `Show your reports (${myReports.length})`}
          </Button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
            <th className="pb-2 pr-3">Name</th>
            <th className="pb-2 pr-3 hidden sm:table-cell">Role</th>
            <th className="pb-2 pr-3">Level</th>
            <th className="pb-2 pr-3">Self check-in</th>
            <th className="pb-2 pr-3">360 given</th>
            <th className="pb-2">Eval</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const isMine =
              !!viewerEmployeeId &&
              (r.manager_id === viewerEmployeeId || r.secondary_manager_id === viewerEmployeeId);
            const selfDone = r.monthly_self_done ?? r.monthly_done;
            const given = r.peer_360_given ?? 0;
            const expected = r.peer_360_expected ?? 0;
            const threeSixtyDone = expected > 0 ? given >= expected : given > 0;
            return (
              <tr key={r.id} className={`border-b border-border/40 last:border-0 ${isMine ? 'bg-primary/5' : ''}`}>
                <td className="py-2 pr-3 font-medium">
                  {r.name}
                  {isMine && <Badge variant="outline" className="ml-2 text-[9px]">Your report</Badge>}
                </td>
                <td className="py-2 pr-3 hidden sm:table-cell text-xs text-muted-foreground">
                  {formatRoles(r.role, asStringList(r.additional_roles), '—')}
                  <span className="block text-[11px]">{formatTeams(r.department, asStringList(r.additional_departments), '')}</span>
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {displayHierarchyLabel(r.hierarchy_level, true, { appraisalMode: tenant.appraisalMode })}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={selfDone ? 'default' : 'outline'} className="text-[10px]">
                    {selfDone ? 'Done' : 'Not done'}
                  </Badge>
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={threeSixtyDone ? 'default' : 'outline'} className="text-[10px]">
                    {given}/{expected || '—'} {threeSixtyDone ? 'Done' : 'Open'}
                  </Badge>
                </td>
                <td className="py-2">
                  <Badge variant={r.eval_done ? 'default' : 'outline'} className="text-[10px]">
                    {r.eval_done ? 'Done' : 'Open'}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
