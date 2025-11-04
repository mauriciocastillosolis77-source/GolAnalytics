import { supabase } from './supabaseClient';

export interface Team {
  id: string;
  nombre: string;
  created_at?: string;
}

export async function fetchTeams(): Promise<Team[]> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error fetching teams:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching teams:', err);
    return [];
  }
}

export async function createTeam(teamName: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('upsert_team', { team_name: teamName });

    if (error) {
      console.error('Error creating team:', error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Exception creating team:', err);
    throw err;
  }
}

export async function getOrCreateTeam(teamName: string): Promise<string> {
  return await createTeam(teamName);
}
