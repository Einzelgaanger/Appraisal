import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ghcGetDirectory } from './ghcApi';

type Row = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  hierarchy_level: number | null;
  manager_id: string | null;
  secondary_manager_id: string | null;
  monthly_done: boolean;
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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyReports, setOnlyReports] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await ghcGetDirectory(periodQuarter, periodMonth);
        if (!cancelled) setRows(data as Row[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [periodQuarter, periodMonth]);

  const myReports = useMemo(() => {
    if (!viewerEmployeeId) return [];
    return rows.filter(
      (r) => r.manager_id === viewerEmployeeId || r.secondary_manager_id === viewerEmployeeId,
    );
  }, [rows, viewerEmployeeId]);

  const visible = onlyReports && viewerEmployeeId ? myReports : rows;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading directory…
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 overflow-x-auto space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">GHC directory & completion</h3>
          <p className="text-xs text-muted-foreground">Month {periodMonth} · Quarter {periodQuarter}</p>
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
            <th className="pb-2 pr-3">L</th>
            <th className="pb-2 pr-3">Monthly</th>
            <th className="pb-2 pr-3">360 in</th>
            <th className="pb-2">Eval</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const isMine =
              !!viewerEmployeeId &&
              (r.manager_id === viewerEmployeeId || r.secondary_manager_id === viewerEmployeeId);
            return (
              <tr key={r.id} className={`border-b border-border/40 last:border-0 ${isMine ? 'bg-primary/5' : ''}`}>
                <td className="py-2 pr-3 font-medium">
                  {r.name}
                  {isMine && <Badge variant="outline" className="ml-2 text-[9px]">Your report</Badge>}
                </td>
                <td className="py-2 pr-3 hidden sm:table-cell text-xs text-muted-foreground">{r.role ?? '—'}</td>
                <td className="py-2 pr-3 font-mono text-xs">{r.hierarchy_level ?? '—'}</td>
                <td className="py-2 pr-3">
                  <Badge variant={r.monthly_done ? 'default' : 'outline'} className="text-[10px]">
                    {r.monthly_done ? 'Done' : 'Open'}
                  </Badge>
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{r.peer_360_count}</td>
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
  );
}
