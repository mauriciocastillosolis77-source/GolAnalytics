import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { generateMatchReportPptx } from '../services/reportExportService';

const GenerarReportesPage: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [torneo, setTorneo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [jornada, setJornada] = useState('');
  const [equipo, setEquipo] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    const loadMatches = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('matches')
          .select('*')
          .order('fecha', { ascending: false });
        if (fetchError) throw fetchError;
        setMatches(data || []);
      } catch (err) {
        console.error('Error fetching matches:', err);
        setError('No se pudieron cargar los partidos.');
      } finally {
        setLoading(false);
      }
    };
    loadMatches();
  }, []);

  // Opciones dependientes: cada select se acota con lo que ya se eligió antes,
  // igual que en RendimientoPage, para que nunca se pueda armar una combinación
  // que no exista en la base de datos.
  const availableTorneos = useMemo(
    () => Array.from(new Set(matches.map((m) => m.torneo))).filter(Boolean).sort(),
    [matches]
  );

  const availableCategorias = useMemo(() => {
    const scoped = torneo ? matches.filter((m) => m.torneo === torneo) : matches;
    return Array.from(new Set(scoped.map((m) => m.categoria))).filter(Boolean).sort();
  }, [matches, torneo]);

  const availableEquipos = useMemo(() => {
    const scoped = matches.filter(
      (m) => (!torneo || m.torneo === torneo) && (!categoria || m.categoria === categoria)
    );
    return Array.from(new Set(scoped.map((m) => m.nombre_equipo))).filter(Boolean).sort();
  }, [matches, torneo, categoria]);

  const availableJornadas = useMemo(() => {
    const scoped = matches.filter(
      (m) =>
        (!torneo || m.torneo === torneo) &&
        (!categoria || m.categoria === categoria) &&
        (!equipo || m.nombre_equipo === equipo)
    );
    return Array.from(new Set(scoped.map((m) => m.jornada))).sort((a, b) => a - b);
  }, [matches, torneo, categoria, equipo]);

  // El partido exacto que resuelven los 4 filtros. Un equipo juega un solo
  // partido por jornada dentro de un torneo/categoría, así que esta combinación
  // siempre apunta, cuando mucho, a una sola fila de `matches`.
  const selectedMatch = useMemo(() => {
    if (!torneo || !categoria || !jornada || !equipo) return null;
    return (
      matches.find(
        (m) =>
          m.torneo === torneo &&
          m.categoria === categoria &&
          m.nombre_equipo === equipo &&
          String(m.jornada) === String(jornada)
      ) || null
    );
  }, [matches, torneo, categoria, jornada, equipo]);

  const allSelected = !!(torneo && categoria && jornada && equipo);

  const resetDownstream = (level: 'torneo' | 'categoria' | 'equipo') => {
    if (level === 'torneo') {
      setCategoria('');
      setEquipo('');
      setJornada('');
    } else if (level === 'categoria') {
      setEquipo('');
      setJornada('');
    } else {
      setJornada('');
    }
  };

  const handleGenerate = async () => {
    if (!selectedMatch) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      await generateMatchReportPptx(selectedMatch);
    } catch (err: any) {
      console.error('Error generating report:', err);
      setGenError(err?.message || 'Error al generar el reporte. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="h-12 w-12" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-white">Generar Reportes</h1>
      <p className="text-gray-400 mb-6">
        Arma el reporte de PowerPoint de un partido específico para compartir con el entrenador.
      </p>

      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-900 text-red-200">{error}</div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Torneo</label>
            <select
              value={torneo}
              onChange={(e) => {
                setTorneo(e.target.value);
                resetDownstream('torneo');
              }}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Selecciona…</option>
              {availableTorneos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                resetDownstream('categoria');
              }}
              disabled={!torneo}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona…</option>
              {availableCategorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Equipo</label>
            <select
              value={equipo}
              onChange={(e) => {
                setEquipo(e.target.value);
                resetDownstream('equipo');
              }}
              disabled={!categoria}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona…</option>
              {availableEquipos.map((eq) => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Jornada</label>
            <select
              value={jornada}
              onChange={(e) => setJornada(e.target.value)}
              disabled={!equipo}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona…</option>
              {availableJornadas.map((j) => (
                <option key={j} value={j}>Jornada {j}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={!selectedMatch || isGenerating}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-md transition-colors duration-200"
          >
            {isGenerating ? 'Generando…' : 'Generar Reporte'}
          </button>
          {!allSelected && (
            <span className="text-sm text-gray-500">Selecciona los 4 filtros para continuar.</span>
          )}
          {allSelected && !selectedMatch && (
            <span className="text-sm text-amber-400">No se encontró un partido con esa combinación.</span>
          )}
        </div>

        {genError && (
          <div className="mt-4 p-4 rounded-md bg-red-900 text-red-200">{genError}</div>
        )}
      </div>

      {selectedMatch && (
        <div className="mt-6 bg-gray-800 rounded-lg p-6 shadow-lg flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">Partido seleccionado</p>
            <p className="text-lg font-semibold text-white">
              {selectedMatch.nombre_equipo} vs {selectedMatch.rival}
            </p>
            <p className="text-sm text-gray-400">
              Jornada {selectedMatch.jornada} · {selectedMatch.torneo} ({selectedMatch.categoria}) ·{' '}
              {new Date(selectedMatch.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-500">
        El reporte se arma con el análisis IA calculado en el momento para este partido (efectividad por línea,
        jugadores destacados, fortalezas y recomendaciones). No incluye todavía las fases tácticas (Inicio /
        Creación / Finalización) ni el Análisis del Rival — esas dos secciones quedan pendientes de conectar.
      </p>
    </div>
  );
};

export default GenerarReportesPage;
