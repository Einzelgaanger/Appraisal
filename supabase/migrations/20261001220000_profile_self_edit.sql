-- Self-serve profile edits: name, role, department, photo.
-- Email and company (subsidiary) cannot be changed here.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;
CREATE POLICY "Avatar images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _name text,
  _role text,
  _department text DEFAULT NULL,
  _avatar_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := auth.uid();
  emp uuid := public.current_employee_id();
  clean_name text := btrim(COALESCE(_name, ''));
  clean_role text := btrim(COALESCE(_role, ''));
  clean_dept text := NULLIF(btrim(COALESCE(_department, '')), '');
  clean_avatar text := NULLIF(btrim(COALESCE(_avatar_url, '')), '');
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in.';
  END IF;
  IF char_length(clean_name) < 2 OR char_length(clean_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF char_length(clean_role) < 2 OR char_length(clean_role) > 160 THEN
    RAISE EXCEPTION 'Please enter your role.';
  END IF;

  UPDATE public.profiles
  SET
    name = clean_name,
    role = clean_role,
    department = COALESCE(clean_dept, department),
    avatar_url = CASE WHEN _avatar_url IS NULL THEN avatar_url ELSE clean_avatar END
  WHERE id = me;

  IF emp IS NOT NULL THEN
    UPDATE public.employees
    SET
      name = clean_name,
      role = clean_role,
      department = COALESCE(clean_dept, department),
      avatar_url = CASE WHEN _avatar_url IS NULL THEN avatar_url ELSE clean_avatar END
    WHERE id = emp;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text) TO authenticated;
