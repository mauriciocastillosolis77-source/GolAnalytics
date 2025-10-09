import { createClient } from '@supabase/supabase-js';

// Configuration uses Vite environment variables, falling back to the provided ones for the demo environment.
// FIX: Use optional chaining (?.) to safely access nested properties that may not exist in all environments (like the demo).
const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || 'https://gmbmzihuskknkrstxveu.supabase.co';
const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYm16aWh1c2trbmtyc3R4dmV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjI1NDAsImV4cCI6MjA3NDgzODU0MH0.0vGgbGnIYvdf65PLcmF199n8Q4UPfqHSm8a9RGHAfJs';

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key is missing. Please check your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * NOTE ON SUPABASE RLS POLICIES:
 * This application is built assuming the following Row Level Security policies
 * are active in your Supabase project.
 *
 * 1. Allow users to read/update their own profile:
 *    - Table: profiles
 *    - Policy: Enable RLS
 *    - FOR SELECT: `auth.uid() = id`
 *    - FOR UPDATE: `auth.uid() = id`
 *
 * 2. Allow authenticated users to read shared data (matches, players, tags):
 *    - Tables: matches, players, tags
 *    - Policy: Enable RLS
 *    - FOR SELECT: `auth.role() = 'authenticated'`
 *
 * 3. Allow only 'admin' role to insert/update/delete tags:
 *    - Table: tags
 *    - FOR INSERT: `(SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'admin'::text`
 *    - FOR UPDATE: `(SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'admin'::text`
 *    - FOR DELETE: `(SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'admin'::text`
 */