import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type LeaveType = 'annual' | 'compassionate' | 'maternity' | 'study' | 'sick' | 'unpaid' | 'parental' | 'other';
export type LeaveStatus = 'pending' | 'hr_approved' | 'manager_approved' | 'approved' | 'declined' | 'cancelled';

export const LEAVE_ALLOWANCE: Record<LeaveType, number> = {
  annual: 10,
  sick: 10,
  compassionate: 5,
  maternity: 90,
  parental: 10,
  study: 10,
  unpaid: 15,
  other: 5,
};

export type LeaveTypeBalance = {
  allowance: number;
  used: number;
  remaining: number;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  day_count: number;
  status: LeaveStatus;
  note: string | null;
  created_at: string;
  manager_id: string | null;
  manager_name: string | null;
  decided_by: string | null;
};

export type LeaveBalance = {
  period: string;
  allowance: number;
  used: number;
  remaining: number;
  department: string | null;
  employee_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_hr: boolean;
  is_line_manager: boolean;
  submit_open: boolean;
  submit_deadline: string;
  allowed_start: string;
  allowed_end: string;
  quarter_start: string;
  quarter_end: string;
  balances: Partial<Record<LeaveType, LeaveTypeBalance>>;
  /** Set when 360 feedback or the quarterly appraisal for this quarter is still open. */
  appraisal_block: string | null;
};

function rpcError(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong.');
}

export async function listLeave(): Promise<LeaveRequest[]> {
  const { data, error } = await db.rpc('workspace_list_leave');
  if (error) rpcError(error);
  return Array.isArray(data) ? data : [];
}

function readBalances(raw: unknown): Partial<Record<LeaveType, LeaveTypeBalance>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Record<LeaveType, LeaveTypeBalance>> = {};
  for (const key of Object.keys(LEAVE_ALLOWANCE) as LeaveType[]) {
    const row = (raw as Record<string, { allowance?: number; used?: number; remaining?: number }>)[key];
    if (!row) continue;
    const allowance = Number(row.allowance ?? LEAVE_ALLOWANCE[key]);
    const used = Number(row.used ?? 0);
    out[key] = {
      allowance,
      used,
      remaining: Number(row.remaining ?? Math.max(0, allowance - used)),
    };
  }
  return out;
}

export async function myLeaveBalance(): Promise<LeaveBalance> {
  const { data, error } = await db.rpc('workspace_my_leave_balance');
  if (error) rpcError(error);
  return {
    period: data?.period ?? '',
    allowance: Number(data?.allowance ?? 10),
    used: Number(data?.used ?? 0),
    remaining: Number(data?.remaining ?? 10),
    department: data?.department ?? null,
    employee_name: data?.employee_name ?? null,
    manager_id: data?.manager_id ?? null,
    manager_name: data?.manager_name ?? null,
    is_hr: Boolean(data?.is_hr),
    is_line_manager: Boolean(data?.is_line_manager),
    submit_open: data?.submit_open !== false,
    submit_deadline: data?.submit_deadline ?? '',
    allowed_start: data?.allowed_start ?? '',
    allowed_end: data?.allowed_end ?? '',
    quarter_start: data?.quarter_start ?? '',
    quarter_end: data?.quarter_end ?? '',
    balances: readBalances(data?.balances),
    appraisal_block: typeof data?.appraisal_block === 'string' && data.appraisal_block.trim()
      ? data.appraisal_block
      : null,
  };
}

export async function placeLeave(payload: {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  note?: string;
  requestId?: string | null;
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_place_leave', {
    _employee_id: payload.employeeId,
    _leave_type: payload.leaveType,
    _start_date: payload.startDate,
    _end_date: payload.endDate,
    _note: payload.note ?? null,
    _request_id: payload.requestId ?? null,
  });
  if (error) rpcError(error);
  return data as string;
}

export async function requestLeave(payload: {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  note?: string;
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_request_leave', {
    _leave_type: payload.leaveType,
    _start_date: payload.startDate,
    _end_date: payload.endDate,
    _note: payload.note ?? null,
  });
  if (error) rpcError(error);
  return data as string;
}

export async function cancelLeave(requestId: string): Promise<void> {
  const { error } = await db.rpc('workspace_cancel_leave', { _request_id: requestId });
  if (error) rpcError(error);
}

export async function decideLeave(requestId: string, approve: boolean): Promise<void> {
  const { error } = await db.rpc('workspace_decide_leave', {
    _request_id: requestId,
    _approve: approve,
  });
  if (error) rpcError(error);
}

export function workingDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function isActiveLeave(status: LeaveStatus) {
  return status === 'pending' || status === 'hr_approved' || status === 'manager_approved' || status === 'approved';
}
