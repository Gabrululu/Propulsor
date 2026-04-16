const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envSupabasePublishableKey = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const fallbackSupabaseUrl = "https://kytfiqkjczkldrkolqqk.supabase.co";
const fallbackSupabasePublishableKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5dGZpcWtqY3prbGRya29scXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU2NjQsImV4cCI6MjA4ODU2MTY2NH0.cnpP96bFwdZExskai8dXIP9I95wIVDtEQumbtgf9nJw";

export const SUPABASE_URL = envSupabaseUrl || fallbackSupabaseUrl;
export const SUPABASE_PUBLISHABLE_KEY =
  envSupabasePublishableKey || envSupabaseAnonKey || fallbackSupabasePublishableKey;

// Fallback values match the project's public anon key — no warning needed.