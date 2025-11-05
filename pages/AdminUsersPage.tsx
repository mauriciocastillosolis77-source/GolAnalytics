import React, { useState, useEffect } from 'react';
import { fetchTeams, Team } from '../services/teamsService';
import { supabase } from '../services/supabaseClient';
import { ROLES } from '../constants';

const AdminUsersPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>(ROLES.AUXILIAR);
  const [teamId, setTeamId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const loadTeams = async () => {
      const teamsData = await fetchTeams();
      setTeams(teamsData);
      if (teamsData.length > 0) {
        setTeamId(teamsData[0].id);
      }
    };
    loadTeams();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (!signUpData.user) {
        throw new Error('No se pudo crear el usuario');
      }

      const userId = signUpData.user.id;

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          rol: role,
          team_id: teamId || null,
          full_name: fullName,
          username: email.split('@')[0],
          email: email,
          avatar_url: null
        });

      if (profileError) {
        console.error('Profile error details:', profileError);
        throw new Error(profileError.message || 'Error al guardar el perfil');
      }

      setMessage({ 
        text: `Usuario creado exitosamente: ${email}. El usuario puede iniciar sesión inmediatamente con la contraseña proporcionada.`, 
        type: 'success' 
      });
      setEmail('');
      setPassword('');
      setFullName('');
      setRole(ROLES.AUXILIAR);
      if (teams.length > 0) {
        setTeamId(teams[0].id);
      }
    } catch (err: any) {
      console.error('Error creating user:', err);
      setMessage({ text: err.message || 'Error al crear usuario', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Administrar Usuarios</h1>

        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Crear Nuevo Usuario</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="usuario@ejemplo.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-300 mb-1">
                Rol
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value={ROLES.AUXILIAR}>Auxiliar (Solo lectura)</option>
                <option value={ROLES.ADMIN}>Administrador (Acceso completo)</option>
              </select>
            </div>

            <div>
              <label htmlFor="team" className="block text-sm font-medium text-gray-300 mb-1">
                Equipo
              </label>
              <select
                id="team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {teams.length === 0 && (
                  <option value="">No hay equipos disponibles</option>
                )}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.nombre}
                  </option>
                ))}
              </select>
            </div>

            {message && (
              <div
                className={`p-4 rounded-md ${
                  message.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || teams.length === 0}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200"
            >
              {isLoading ? 'Creando usuario...' : 'Crear Usuario'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-700 rounded-md">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Información:</h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• <strong>Auxiliar:</strong> Solo puede ver el tablero y datos de su equipo</li>
              <li>• <strong>Admin:</strong> Puede acceder a todas las funciones y equipos</li>
              <li>• La contraseña debe tener al menos 6 caracteres</li>
              <li>• El usuario recibirá un email de confirmación (si está configurado)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUsersPage;
