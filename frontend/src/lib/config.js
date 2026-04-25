function normalizeUrl(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

export const clientConfig = {
  apiBaseUrl: normalizeUrl(import.meta.env.VITE_API_BASE_URL),
  supabaseUrl: normalizeUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
};

export const requiredClientEnv = [
  "VITE_API_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];

export const missingClientEnv = requiredClientEnv.filter((name) => !import.meta.env[name]);

