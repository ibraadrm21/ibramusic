import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cagjkqrkkufdevynnlrf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZ2prcXJra3VmZGV2eW5ubHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTUxNTYsImV4cCI6MjA5NDA5MTE1Nn0.j5GMLFL1laICtJXNbjzccymtzSxzZT4SnpWIlJcn6kc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
