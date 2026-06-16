import { supabase } from "./supabaseClient";

export interface SyncData {
  favorites?: any[];
  playlists?: any[];
  followedArtists?: any[];
  themeSettings?: any;
}

/**
 * Sign up a new user with email and password.
 */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in an existing user with email and password.
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Fetch the current session.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/**
 * Save user data to Supabase.
 */
export async function saveUserData(data: SyncData): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("user_sync").upsert({
    id: user.id,
    updated_at: new Date().toISOString(),
    data: data as any,
  });

  if (error) {
    console.error("Failed to save sync data to Supabase:", error);
    throw error;
  }
}

/**
 * Retrieve user data from Supabase.
 */
export async function getUserData(): Promise<SyncData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_sync")
    .select("data")
    .eq("id", user.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Record doesn't exist yet
      return null;
    }
    console.error("Failed to fetch sync data from Supabase:", error);
    throw error;
  }

  return data?.data as SyncData;
}
