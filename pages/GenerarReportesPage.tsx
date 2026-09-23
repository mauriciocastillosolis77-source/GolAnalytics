import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { generateMatchReportPptx } from '../services/reportExportService';

declare var XLSX: any;

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

  // Nombre/puesto para el crédito de la portada — fijo por default (siempre el
  // mismo), pero editable por si algún día cambia.
  const [authorName, setAuthorName] = useState('Mauricio Castillo — Analista Táctico y de Rendimiento');

  // Excel opcional con posiciones detalladas (Lateral Izquierdo, Extremo
  // Derecho, etc.) — mismo formato que el Excel de jugadores del Etiquetador
  // (columnas nombre, numero, posicion). Se lee y se queda SOLO en memoria de
  // esta página: nunca se sube a Supabase, ni se guarda en ningún lado.
  const [positionsMap, setPositionsMap] = useState<Map<string, string> | null>(null);
  const [positionsFileName, setPositionsFileName] = useState('');
  const [positionsError, setPositionsError] = useState<string | null>(null);

  // Modelo de Juego — Plan vs. Ejecución. Esto NO se calcula de los tags: es
  // contenido que el cuerpo técnico define — pero son siempre los mismos 8
  // pilares, así que vienen precargados por default; solo hay que elegir el
  // semáforo y escribir la nota de cada uno. Una fila sin nota no sale en el
  // reporte (se entiende que no se revisó esta vez).
  const PILARES_DEFAULT = [
    '4-4-2 / 4-3-3',
    'Presión bloque alto',
    'Amplitud priorizada',
    'Salida combinativa',
    'Creación por 3er hombre',
    'Definición según la jugada',
    'ABP ofensivo prefabricado',
    'ABP defensivo: decisión del equipo',
  ];
  const [pilaresTexto, setPilaresTexto] = useState(PILARES_DEFAULT.join('\n'));
  type Semaforo = 'verde' | 'ambar' | 'rojo';
  type ChecklistRow = { label: string; signal: Semaforo; nota: string };
  const [checklist, setChecklist] = useState<ChecklistRow[]>(
    PILARES_DEFAULT.map((label) => ({ label, signal: 'verde' as Semaforo, nota: '' }))
  );
  const addChecklistRow = () => setChecklist((rows) => [...rows, { label: '', signal: 'verde', nota: '' }]);
  const removeChecklistRow = (i: number) => setChecklist((rows) => rows.filter((_, idx) => idx !== i));
  const updateChecklistRow = (i: number, patch: Partial<ChecklistRow>) =>
    setChecklist((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

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
      const pilares = pilaresTexto.split('\n').map((s) => s.trim()).filter(Boolean);
      const checklistLimpio = checklist
        .map((r) => ({ ...r, label: r.label.trim(), nota: r.nota.trim() }))
        .filter((r) => r.label && r.nota);
      const modeloDeJuego = (pilares.length > 0 || checklistLimpio.length > 0)
        ? { pilares, checklist: checklistLimpio }
        : undefined;

      await generateMatchReportPptx(selectedMatch, authorName.trim() || undefined, positionsMap || undefined, modeloDeJuego);
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
          <label className="block text-sm font-medium mb-2 text-gray-300">
            Nombre para el crédito de la portada <span className="text-gray-500 font-normal">— opcional</span>
          </label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Ej: Mauricio Castillo — Analista Táctico y de Rendimiento"
            className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
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

        <div className="mt-6 pt-6 border-t border-gray-700">
          <label className="block text-sm font-medium mb-1 text-gray-300">
            Modelo de Juego — Plan vs. Ejecución <span className="text-gray-500 font-normal">— opcional</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Esto lo define el cuerpo técnico, no se calcula de los tags. Si lo dejas vacío, ese slide no aparece en el reporte.
          </p>

          <label className="block text-xs text-gray-400 mb-1">Pilares de identidad (uno por línea)</label>
          <textarea
            value={pilaresTexto}
            onChange={(e) => setPilaresTexto(e.target.value)}
            placeholder={'4-4-2 / 4-3-3\nPresión bloque alto\nAmplitud priorizada\nSalida combinativa'}
            rows={4}
            className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
          />

          <label className="block text-xs text-gray-400 mb-2">
            ¿Se ejecutó en este partido? <span className="text-gray-500">— deja la nota vacía en las que no revisaste esta vez, esas no salen en el reporte.</span>
          </label>
          <div className="space-y-2">
            {checklist.map((row, i) => (
              <div key={i} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-gray-700/50 p-2 rounded">
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateChecklistRow(i, { label: e.target.value })}
                  placeholder="Ej: Presión bloque alto"
                  className="flex-1 w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <select
                  value={row.signal}
                  onChange={(e) => updateChecklistRow(i, { signal: e.target.value as Semaforo })}
                  className="bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="verde">🟢 Verde</option>
                  <option value="ambar">🟡 Ámbar</option>
                  <option value="rojo">🔴 Rojo</option>
                </select>
                <input
                  type="text"
                  value={row.nota}
                  onChange={(e) => updateChecklistRow(i, { nota: e.target.value })}
                  placeholder="Nota (ej: efectiva en el primer tiempo, bajó tras el min 30)"
                  className="flex-[2] w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => removeChecklistRow(i)}
                  className="text-red-400 hover:text-red-300 text-sm px-2"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addChecklistRow}
            className="mt-2 text-sm text-cyan-400 hover:text-cyan-300"
          >
            + Agregar fila
          </button>
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
