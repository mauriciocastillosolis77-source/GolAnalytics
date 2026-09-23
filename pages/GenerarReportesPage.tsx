import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { generateMatchReportPptx } from '../services/reportExportService';
import { useAuth } from '../contexts/AuthContext';

declare var XLSX: any;

const GenerarReportesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [torneo, setTorneo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [jornada, setJornada] = useState('');
  const [equipo, setEquipo] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Excel opcional con posiciones detalladas (Lateral Izquierdo, Extremo
  // Derecho, etc.) — mismo formato que el Excel de jugadores del Etiquetador
  // (columnas nombre, numero, posicion). Se lee y se queda SOLO en memoria de
  // esta página: nunca se sube a Supabase, ni se guarda en ningún lado.
  const [positionsMap, setPositionsMap] = useState<Map<string, string> | null>(null);
  const [positionsFileName, setPositionsFileName] = useState('');
  const [positionsError, setPositionsError] = useState<string | null>(null);

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
      setCategoria(''); setEquipo(''); setJornada('');
    } else if (level === 'categoria') {
      setEquipo(''); setJornada('');
    } else {
      setJornada('');
    }
  };

  const handlePositionsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPositionsError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (!data) throw new Error('No se pudo leer el archivo.');
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawData.length < 2) throw new Error('El archivo está vacío.');

        const headers = rawData[0].map((h: any) => String(h).trim().toLowerCase());
        const required = ['nombre', 'posicion'];
        if (!required.every((h) => headers.includes(h))) {
          throw new Error(`El archivo debe contener al menos las columnas: ${required.join(', ')}.`);
        }

        const map = new Map<string, string>();
        rawData.slice(1).forEach((row) => {
          const nombre = String(row[headers.indexOf('nombre')] || '').trim();
          const posicion = String(row[headers.indexOf('posicion')] || '').trim();
          if (nombre && posicion) map.set(nombre.toLowerCase(), posicion);
        });

        if (map.size === 0) throw new Error('No se encontraron filas válidas con nombre y posición.');
        setPositionsMap(map);
        setPositionsFileName(file.name);
      } catch (err: any) {
        setPositionsError(err?.message || 'Error al leer el Excel.');
        setPositionsMap(null);
        setPositionsFileName('');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerate = async () => {
    if (!selectedMatch) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const authorName = profile?.username || user?.email || undefined;
      await generateMatchReportPptx(selectedMatch, authorName, positionsMap || undefined);
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

      {error && <div className="mb-4 p-4 rounded-md bg-red-900 text-red-200">{error}</div>}

      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Torneo</label>
            <select
              value={torneo}
              onChange={(e) => { setTorneo(e.target.value); resetDownstream('torneo'); }}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Selecciona…</option>
              {availableTorneos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); resetDownstream('categoria'); }}
              disabled={!torneo}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona…</option>
              {availableCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Equipo</label>
            <select
              value={equipo}
              onChange={(e) => { setEquipo(e.target.value); resetDownstream('equipo'); }}
              disabled={!categoria}
              className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona…</option>
              {availableEquipos.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
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
              {availableJornadas.map((j) => <option key={j} value={j}>Jornada {j}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700">
          <label className="block text-sm font-medium mb-1 text-gray-300">
            Posiciones detalladas (Excel) <span className="text-gray-500 font-normal">— opcional</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Mismo formato que el Excel de jugadores del Etiquetador (columnas <code>nombre</code>, <code>posicion</code>).
            Solo se usa para calcular el carril (izquierda/derecha) de este reporte — no se guarda en ningún lado.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handlePositionsFileChange}
            className="w-full text-sm text-gray-400 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500"
          />
          {positionsFileName && (
            <p className="text-xs text-green-400 mt-2">✅ {positionsFileName} — {positionsMap?.size} jugadores con posición cargados en memoria.</p>
          )}
          {positionsError && <p className="text-xs text-red-400 mt-2">{positionsError}</p>}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={!selectedMatch || isGenerating}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-md transition-colors duration-200"
          >
            {isGenerating ? 'Generando…' : 'Generar Reporte'}
          </button>
          {!allSelected && <span className="text-sm text-gray-500">Selecciona los 4 filtros para continuar.</span>}
          {allSelected && !selectedMatch && <span className="text-sm text-amber-400">No se encontró un partido con esa combinación.</span>}
        </div>

        {genError && <div className="mt-4 p-4 rounded-md bg-red-900 text-red-200">{genError}</div>}
      </div>

      {selectedMatch && (
        <div className="mt-6 bg-gray-800 rounded-lg p-6 shadow-lg flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">Partido seleccionado</p>
            <p className="text-lg font-semibold text-white">{selectedMatch.nombre_equipo} vs {selectedMatch.rival}</p>
            <p className="text-sm text-gray-400">
              Jornada {selectedMatch.jornada} · {selectedMatch.torneo} ({selectedMatch.categoria}) ·{' '}
              {new Date(selectedMatch.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerarReportesPage;
