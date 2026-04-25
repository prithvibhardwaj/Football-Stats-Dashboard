import { createClient } from "@supabase/supabase-js";

import { clientConfig } from "./config";

const supabaseUrl = clientConfig.supabaseUrl;
const supabaseAnonKey = clientConfig.supabaseAnonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function isSavedTeamsSchemaError(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();

  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

export function describeSavedTeamsSyncError(error) {
  if (isSavedTeamsSchemaError(error)) {
    return "Supabase profile tables are missing, so pinned teams are being kept locally on this device. Run supabase/schema.sql to enable sync.";
  }

  return "Supabase could not sync your pinned teams, so the app is using the local copy on this device.";
}

export async function fetchUserTeams(userId) {
  if (!supabase || !userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_teams")
    .select("id, team_id, team_name, league_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchUserPreferences(userId) {
  if (!supabase || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("league_ids, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
