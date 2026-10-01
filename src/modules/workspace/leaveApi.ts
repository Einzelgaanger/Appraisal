import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'parental' | 'compassionate' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  note: string | null;
  created_at: string;
  decided_by: string | null;
};

function rpcError(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong.');
}

export async function listLeave(): Promise<LeaveRequest[]> {
  const { data, error } = await db.rpc('workspace_list_leave');
  if (error) rpcError(error);
  return Array.isArray(data) ? data : [];
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
