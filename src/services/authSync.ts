import { supabase } from "./supabaseClient";

import { equalLibraryData, mergeLibrary, type Library } from "./librarySync";

export async function syncLibrary(userId: string, local: Library, base: Partial<Library>): Promise<Library> {
  const signal = AbortSignal.timeout(15_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from("user_sync").select("data, updated_at").eq("id", userId).abortSignal(signal).maybeSingle();
    if (error) throw error;
    const merged = mergeLibrary(base, local, data?.data ?? {});
    if (data && equalLibraryData(merged, data.data)) return merged;

    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(data?.updated_at ?? "") || 0) + 1)).toISOString();
    if (!data) {
      const result = await supabase.from("user_sync").insert({ id: userId, updated_at: updatedAt, data: merged }).abortSignal(signal);
      if (!result.error) return merged;
      if (result.error.code !== "23505") throw result.error;
    } else {
      const query = supabase.from("user_sync").update({ data: merged, updated_at: updatedAt }).eq("id", userId);
      const result = await (data.updated_at ? query.eq("updated_at", data.updated_at) : query.is("updated_at", null)).select("id").abortSignal(signal).maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return merged;
    }
  }
  throw new Error("La biblioteca se está modificando en otro dispositivo. Vuelve a intentarlo.");
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL(window.location.pathname, window.location.origin).href,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({ email, type: "signup" });
  if (error) throw error;
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
