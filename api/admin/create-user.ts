import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/*
  Endpoint serverless: /api/admin/create-user
  - Método: POST
  - Body JSON esperado:
    {
      "email": "user@example.com",
      "password": "Secret123!",
      "role": "auxiliar" | "admin" | "user",
      "team_id": "uuid-of-team-or-null",
      "full_name": "Nombre completo"
    }
  - Protegido por un token simple: X-ADMIN-TOKEN header (configure un valor secreto en Vercel llamado ADMIN_CREATION_TOKEN)
  - Usa SUPABASE_SERVICE_ROLE_KEY desde variables de entorno (no tiene prefijo VITE_)
*/

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_CREATION_TOKEN = process.env.ADMIN_CREATION_TOKEN || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase config envs');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple protection: check ADMIN_CREATION_TOKEN header
  const tokenHeader = (req.headers['x-admin-token'] as string) || (req.headers['X-ADMIN-TOKEN'] as string) || '';
  if (!ADMIN_CREATION_TOKEN || tokenHeader !== ADMIN_CREATION_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized - missing or invalid admin token' });
  }

  const { email, password, role = 'auxiliar', team_id = null, full_name = null } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    // 1) Create user in Supabase Auth using admin API
    // If the user already exists, Supabase will return an error; depending on your desired behavior
    // you might want to lookup by email first. For now we attempt createUser and surface errors.
    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: full_name || null }
    });

    if (createUserError) {
      console.error('Error creating user:', createUserError);
      return res.status(500).json({ error: 'Error creating user', details: createUserError.message });
    }

    const userId = userData?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'No user id returned from Supabase' });
    }

    // 2) Insert or update (upsert) profile row in 'profiles' table
    const profileRow: any = {
      id: userId,
      rol: role,
      email,
      full_name
    };
    if (team_id !== null && team_id !== undefined) {
      profileRow.team_id = team_id;
    }

    // Use upsert so if the profile already exists we update it, otherwise insert.
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileRow, { returning: 'minimal' });

    if (upsertError) {
      console.error('Error upserting profile:', upsertError);
      // Surface a clear error; do not attempt to delete the created user here.
      return res.status(500).json({ error: 'Error inserting/updating profile', details: upsertError.message });
    }

    // Return success to the caller
    return res.status(201).json({ message: 'User created', id: userId, email });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error', details: err.message || err });
  }
}
