/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_LOCAL_DEV?: string;
  readonly VITE_ACTIVE_APPRAISAL_QUARTER?: string;
  readonly VITE_DEMO_APPRAISAL_XLSX_PATH?: string;
  readonly VITE_LEGACY_ADMIN_EMAIL?: string;
  readonly VITE_LEGACY_ADMIN_PASSWORD?: string;
  readonly VITE_LEGACY_ADMIN_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
