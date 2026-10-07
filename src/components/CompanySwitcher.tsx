import { useState } from 'react';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Lets people who work across companies move between them.
 *
 * Renders nothing for the overwhelming majority who belong to one company, so it
 * can sit unconditionally in the sidebar.
 */
export default function CompanySwitcher({ branded = false }: { branded?: boolean }) {
  const { companies, switchCompany } = useEmployeeAuth();
  const [switching, setSwitching] = useState<string | null>(null);

  if (companies.length < 2) return null;

  const active = companies.find((c) => c.is_active) ?? companies[0];

  const handleSelect = async (employeeId: string) => {
    if (employeeId === active?.employee_id) return;
    setSwitching(employeeId);
    const { error } = await switchCompany(employeeId);
    if (error) {
      setSwitching(null);
      toast.error(error);
    }
    // On success the tenant lock changes and the app navigates to the other
    // company's host, so this component unmounts mid-flight.
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-xl border px-2.5 text-left text-[12.5px] transition-colors',
          branded
            ? 'border-white/25 text-white hover:bg-white/10'
            : 'border-border hover:bg-muted/50',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 flex-shrink-0 opacity-70" />
          <span className="truncate font-medium">{active?.company_name ?? 'Select company'}</span>
        </span>
        {switching ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="max-h-[min(70dvh,22rem)] w-[max(16rem,var(--app-sidebar-w))] max-w-[18rem] overflow-y-auto"
      >
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          You work across {companies.length} companies
        </DropdownMenuLabel>
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.employee_id}
            onSelect={() => void handleSelect(company.employee_id)}
            className="gap-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{company.company_name}</span>
              {(company.employee_role || company.employee_name) && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {company.employee_name}
                  {company.employee_role ? ` · ${company.employee_role}` : ''}
                </span>
              )}
            </span>
            {company.is_active && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
