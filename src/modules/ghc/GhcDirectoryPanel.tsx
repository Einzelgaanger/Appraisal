import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { ghcGetDirectory } from './ghcApi';

type Row = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  hierarchy_level: number | null;
  monthly_done: boolean;
  peer_360_count: number;
  eval_done: boolean;
};

export default function GhcDirectoryPanel({
  periodQuarter,
  periodMonth,
}: {
  periodQuarter: string;
  periodMonth: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading directory…
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 overflow-x-auto">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">GHC directory & completion</h3>
        <p className="text-xs text-muted-foreground">Month {periodMonth} · Quarter {periodQuarter}</p>
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
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 last:border-0">
              <td className="py-2 pr-3 font-medium">{r.name}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
