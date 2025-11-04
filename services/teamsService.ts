import { supabase } from './supabaseClient';

export interface Team {
  id: string;
  name: string;
  created_at?: string;
}

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching teams:', error);
    throw error;
  }

  return data || [];
}

export async function createTeam(teamName: string): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_team', { team_name: teamName });

  if (error) {
    console.error('Error creating team:', error);
    throw error;
  }

  return data;
}

export async function getOrCreateTeam(teamName: string): Promise<string> {
  return await createTeam(teamName);
}
