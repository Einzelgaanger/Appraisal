-- Keep VigiPay (and any locked) people on their home tenant even if complete-profile
-- still posts a different subsidiary_id. Triggers run for the service role.

CREATE OR REPLACE FUNCTION public.employees_protect_locked_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND coalesce(OLD.locked_tenant_slug, '') <> '' THEN
    NEW.locked_tenant_slug := OLD.locked_tenant_slug;
    IF OLD.locked_tenant_slug = 'vigipay' THEN
      NEW.subsidiary_id := coalesce(OLD.subsidiary_id, public.vigipay_subsidiary_id());
      NEW.vigipay_appraisal_active := true;
      NEW.ghc_appraisal_active := false;
      NEW.eo_appraisal_active := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_protect_locked_tenant ON public.employees;
CREATE TRIGGER trg_employees_protect_locked_tenant
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.employees_protect_locked_tenant();
