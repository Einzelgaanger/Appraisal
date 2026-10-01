-- Company-private leave requests. Schema only — no seed rows.
-- Demo data is loaded by `npm run seed:local` against Docker, never by db:push.

CREATE TABLE IF NOT EXISTS public.workspace_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (
    leave_type IN ('annual', 'sick', 'unpaid', 'parental', 'compassionate', 'other')
  ),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'declined', 'cancelled')
  ),
  note text,
  decided_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_leave_date_range CHECK (end_date >= start_date),
  CONSTRAINT workspace_leave_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS workspace_leave_subsidiary_idx
  ON public.workspace_leave_requests (subsidiary_id, start_date);
CREATE INDEX IF NOT EXISTS workspace_leave_employee_idx
  ON public.workspace_leave_requests (employee_id, start_date DESC);

ALTER TABLE public.workspace_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_leave_visible(_row public.workspace_leave_requests)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT _row.subsidiary_id = public.workspace_my_subsidiary_id()
$$;

DROP POLICY IF EXISTS workspace_leave_select ON public.workspace_leave_requests;
CREATE POLICY workspace_leave_select ON public.workspace_leave_requests
  FOR SELECT TO authenticated
  USING (public.workspace_leave_visible(workspace_leave_requests));

CREATE OR REPLACE FUNCTION public.workspace_list_leave()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'employee_id', r.employee_id,
    'employee_name', e.name,
    'leave_type', r.leave_type,
    'start_date', r.start_date,
    'end_date', r.end_date,
    'status', r.status,
    'note', r.note,
    'created_at', r.created_at,
    'decided_by', r.decided_by
  ) ORDER BY r.start_date, e.name), '[]'::jsonb)
  FROM public.workspace_leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  WHERE r.subsidiary_id = public.workspace_my_subsidiary_id()
    AND r.status <> 'cancelled';
$$;

CREATE OR REPLACE FUNCTION public.workspace_request_leave(
  _leave_type text,
  _start_date date,
  _end_date date,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  rid uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date.';
  END IF;
  INSERT INTO public.workspace_leave_requests (
    subsidiary_id, employee_id, leave_type, start_date, end_date, note, status
  ) VALUES (
    sid, me, _leave_type, _start_date, _end_date,
    NULLIF(btrim(COALESCE(_note, '')), ''), 'pending'
  )
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_cancel_leave(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
BEGIN
  UPDATE public.workspace_leave_requests
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = _request_id
    AND employee_id = me
    AND subsidiary_id = public.workspace_my_subsidiary_id()
    AND status IN ('pending', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only cancel your own pending or approved leave.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_decide_leave(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  admin boolean := false;
BEGIN
  SELECT COALESCE(e.company_admin, false) INTO admin
  FROM public.employees e
  WHERE e.id = me;

  IF NOT admin THEN
    RAISE EXCEPTION 'Only a company admin can approve or decline leave.';
  END IF;

  UPDATE public.workspace_leave_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
      decided_by = me,
      decided_at = now(),
      updated_at = now()
  WHERE id = _request_id
    AND subsidiary_id = public.workspace_my_subsidiary_id()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending leave request to decide.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_leave_visible(public.workspace_leave_requests) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_list_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_request_leave(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_cancel_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_decide_leave(uuid, boolean) TO authenticated;
GRANT SELECT ON public.workspace_leave_requests TO authenticated;
