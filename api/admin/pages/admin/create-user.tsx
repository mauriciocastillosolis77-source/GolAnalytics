import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Frontend Supabase envs (asegúrate de tenerlas en Vercel as NEXT_PUBLIC or VITE vars)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function AdminCreateUser() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('auxiliar');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // get session and subscribe to changes
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Simple client-side check to hide UI if not admin (proxy also verifies)
  const checkAdminRole = async (): Promise<boolean> => {
    if (!session?.user?.id) return false;
    const { data, error: pErr } = await supabase
      .from('profiles')
      .select('rol')
      .eq('id', session.user.id)
      .limit(1)
      .single();
    if (pErr) {
      console.error('Error checking profile role', pErr);
      return false;
    }
    return data?.rol === 'admin';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!session?.access_token) {
      setError('Necesitas iniciar sesión como admin para crear usuarios.');
      return;
    }

    setLoading(true);

    try {
      // Optional client-side check
      const isAdmin = await checkAdminRole();
      if (!isAdmin) {
        setError('Acceso denegado: necesitas ser admin.');
        setLoading(false);
        return;
      }

      const payload = {
        email,
        password,
        role,
        team_id: teamId || null,
        full_name: fullName || null
      };

      const resp = await fetch('/api/admin/create-user-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const text = await resp.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch(e) { json = text; }

      if (!resp.ok) {
        setError(JSON.stringify(json || { status: resp.status }));
      } else {
        setResult(json);
        setEmail(''); setPassword(''); setFullName(''); setTeamId(null);
      }
    } catch (err: any) {
      console.error('Error creating user', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Admin - Crear usuario</h2>
        <p>Debes iniciar sesión como admin para ver este formulario.</p>
        <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}>
          Inicia sesión (Google)
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>
      <h2>Crear nuevo usuario</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Correo Electrónico
          <input value={email} onChange={e => setEmail(e.target.value)} required />
        </label>

        <label>
          Contraseña
          <input value={password} onChange={e => setPassword(e.target.value)} required />
        </label>

        <label>
          Rol
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="auxiliar">auxiliar</option>
            <option value="admin">admin</option>
            <option value="user">user</option>
          </select>
        </label>

        <label>
          Team ID (opcional)
          <input value={teamId || ''} onChange={e => setTeamId(e.target.value || null)} />
        </label>

        <label>
          Nombre completo
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </label>

        <div>
          <button type="submit" disabled={loading}>
            {loading ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </form>

      {error && (
        <div style={{ marginTop: 12, color: 'crimson' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, color: 'green' }}>
          <strong>Resultado:</strong> {JSON.stringify(result)}
        </div>
      )}
    </div>
  );
}
