import { createClient } from '@supabase/supabase-js';

function cleanEnvValue(val: any): string {
  if (!val) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1).trim();
  }
  if (s === "" || s === "undefined" || s === "null") {
    return "";
  }
  return s;
}

// Get URL and Key robustly across environments (Node server, Vite dev, Vite production)
let rawUrl = "";
let rawKey = "";

try {
  // Try reading standard Vite client-side environment variables first (populated on build or dev server)
  rawUrl = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || ((import.meta as any).env?.SUPABASE_URL as string) || "";
  rawKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || ((import.meta as any).env?.SUPABASE_ANON_KEY as string) || "";
} catch (e) {
  // Ignore env access errors
}

// Fallback to process.env literal replacement.
// We must NOT use optional chaining (process.env?.SUPABASE_URL) because Vite's define plugin 
// strictly matches the exact string literal 'process.env.SUPABASE_URL'.
if (!rawUrl && typeof process !== 'undefined' && process.env) {
  try {
    rawUrl = (process.env.SUPABASE_URL as string) || "";
  } catch (e) {}
}
if (!rawUrl && typeof process !== 'undefined' && process.env) {
  try {
    rawUrl = (process.env.VITE_SUPABASE_URL as string) || "";
  } catch (e) {}
}

if (!rawKey && typeof process !== 'undefined' && process.env) {
  try {
    rawKey = (process.env.SUPABASE_ANON_KEY as string) || "";
  } catch (e) {}
}
if (!rawKey && typeof process !== 'undefined' && process.env) {
  try {
    rawKey = (process.env.VITE_SUPABASE_ANON_KEY as string) || "";
  } catch (e) {}
}

export let supabaseUrl = cleanEnvValue(rawUrl);
export let supabaseAnonKey = cleanEnvValue(rawKey);

// Fallback to active sandbox template if completely unconfigured
if (!supabaseUrl) {
  supabaseUrl = 'https://flpyrkjpgvazpdortrtn.supabase.co';
}
if (!supabaseAnonKey) {
  supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZscHlya2pwZ3ZhenBkb3J0cnRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY0NDEzMCwiZXhwIjoyMDk0MjIwMTMwfQ.lxtnlOykzyGUpV5S1Q1AOGVqOXlgpt3ZGq16TJTDkxY';
}

// Export a reassignment-friendly client
// --- PASTE THIS AT THE BOTTOM OF YOUR supabase.ts FILE ---

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase client failed to initialize. Check your URL and Key.");
  }
  return supabase;
}