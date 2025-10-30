import { createClient } from '@supabase/supabase-js';

/*
  Serverless proxy endpoint: /api/admin/create-user-proxy
  - Método: POST
  - Headers:
    - Authorization: Bearer <access_token>   // token del admin (session.access_token) obtenido en frontend
  - Body JSON esperado:
    {
      "email": "user@example.com",
      "password": "Secret123!",
      "role": "auxiliar" | "admin" | "user",
      "team_id": "uuid-or-null",
      "full_name": "Nombre completo"
    }
  - Qué hace:
    1) Verifica que la petición venga de un usuario autenticado cuyo perfil tenga rol = 'admin'
    2) Crea el usuario en Supabase Auth usando la service_role key
    3) Inserta/upserta el profile en la tabla profiles
*/

// No usamos tipos específicos de Vercel para evitar dependencias de build
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase config envs (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 0) verify Authorization header with user's access token (session token from frontend)
    const authHeader = (req.headers['authorization'] || req.headers['Authorization'] || '') as string;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }
    const userAccessToken = match[1];

    // 1) get user info from Supabase using the provided access token
    // Note: getUser accepts the token via auth.getUser(token)
    const { data: tokenUserData, error: getUserErr } = await supabaseAdmin.auth.getUser(userAccessToken);
    if (getUserErr || !tokenUserData?.user?.id) {
      console.error('Error retrieving user from token', getUserErr);
      return res.status(401).json({ error: 'Invalid access token' });
    }
    const requesterId = tokenUserData.user.id;

    // 2) check the profiles table to ensure requester has role 'admin'
    const { data: profileRows, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('rol')
      .eq('id', requesterId)
      .limit(1);

    if (profileErr) {
      console.error('Error fetching requester profile', profileErr);
      return res.status(500).json({ error: 'Error verifying admin role', details: profileErr.message });
    }
    const requesterRole = profileRows && profileRows.length > 0 ? (profileRows[0] as any).rol : null;
    if (requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - admin role required' });
    }

    // 3) read body and validate
    const { email, password, role = 'auxiliar', team_id = null, full_name = null } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // 4) create user in Supabase Auth using admin API
    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: full_name || null }
    });

    if (createUserError) {
      console.error('Error creating user in auth:', createUserError);
      return res.status(500).json({ error: 'Error creating user', details: createUserError.message });
    }

    const userId = userData?.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'No user id returned from Supabase' });
    }

    // 5) upsert profile row in 'profiles' table
    const profileRow: any = {
      id: userId,
      rol: role,
      email,
      full_name
    };
    if (team_id !== null && team_id !== undefined) {
      profileRow.team_id = team_id;
    }

    // Quitar la opción 'returning' para evitar incompatibilidades con la versión de tipos
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileRow);

    if (upsertError) {
      console.error('Error upserting profile:', upsertError);
      return res.status(500).json({ error: 'Error inserting/updating profile', details: upsertError.message });
    }

    return res.status(201).json({ message: 'User created', id: userId, email });
  } catch (err: any) {
    console.error('Unexpected error in proxy:', err);
    return res.status(500).json({ error: 'Unexpected error', details: err.message || err });
  }
}
