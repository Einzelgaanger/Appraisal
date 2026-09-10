import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type NotificationRow = {
  id: string;
  event_type: string;
  period: string | null;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
  is_unread: boolean;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function GhcNotificationsBell({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db.rpc('ghc_get_my_notifications', { _limit: 30 });
      if (!error && Array.isArray(data)) {
        const list = data as NotificationRow[];
        setRows(list);
        setUnread(list.filter((r) => r.is_unread).length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const markRead = async (id: string) => {
    await db.rpc('ghc_mark_notification_read', { _notification_id: id });
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, read_at: r.read_at ?? new Date().toISOString(), is_unread: false } : r)),
    );
    setUnread((n) => Math.max(0, n - 1));
  };

  const openItem = async (row: NotificationRow) => {
    if (row.is_unread) await markRead(row.id);
    setOpen(false);
    if (row.href) navigate(row.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn('relative', className)}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold">GHC notifications</div>
        <div className="max-h-80 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No notifications yet.</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => void openItem(row)}
                className={cn(
                  'block w-full border-b border-border/50 px-3 py-2.5 text-left hover:bg-muted/40',
                  row.is_unread && 'bg-primary/5',
                )}
              >
                <p className="text-xs font-medium">{row.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{row.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{formatWhen(row.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
