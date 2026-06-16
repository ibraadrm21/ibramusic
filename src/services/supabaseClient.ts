import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const SUPABASE_URL = "https://nkhonqrseaymilneurgj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raG9ucXJzZWF5bWlsbmV1cmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDQ1NTgsImV4cCI6MjA5NzEyMDU1OH0.zdzwopG3BXoTmqzuoEPQ0FcsBUhmjgrgMirWZFTZcPo";

const isNative = Capacitor.isNativePlatform();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Use localStorage so sessions survive app restarts on Android WebView
    storage: window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Capacitor uses custom schemes (capacitor://), not standard browser URLs,
    // so disable URL-based session detection to avoid broken OAuth redirects
    detectSessionInUrl: !isNative,
  },
});

