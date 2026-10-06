-- Saved peer comments have to come back into the editor.
-- The assignment list was returning status only, so reopening a draft
-- showed a blank box and the next save could replace the stored text.

DROP FUNCTION IF EXISTS public.get_boom_comment_assignments(text);

CREATE FUNCTION public.get_boom_comment_assignments(_period text)
RETURNS TABLE (
  reviewee_id uuid,
  reviewee_name text,
  reviewee_role text,
  reviewee_department text,
  comment_id uuid,
  status text,
  comment_text text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.role,
    e.department,
    c.id,
    COALESCE(c.status, 'todo'),
    COALESCE(c.comment_text, '')
  FROM public.employees e
  LEFT JOIN public.assessment_peer_comments c
    ON c.reviewee_employee_id = e.id
   AND c.reviewer_employee_id = me
   AND c.period = _period
  WHERE public.boom_comment_allowed(me, e.id)
  ORDER BY e.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_boom_comment_assignments(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
