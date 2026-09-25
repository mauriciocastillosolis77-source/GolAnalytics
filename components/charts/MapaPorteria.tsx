import React, { useMemo, useState } from 'react';
import type { Tag, Match } from '../../types';
import { ALTURAS, LADOS, codigoPorteria, detalleGolDe, etiquetaPorteria } from '../../utils/goles';
import PorteriaEstadio from './PorteriaEstadio';

// ─────────────────────────────────────────────────────────────────────────────
// Mini portería 3×3 (mejora 6): dónde entraron los goles que recibe.
// Vista de frente, como la ve el que tira. Selector de jornada opcional.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    titulo: string;
    tags: Tag[];
    matches?: Match[];
}

const MapaPorteria: React.FC<Props> = ({ titulo, tags, matches }) => {
    const [jornadaSel, setJornadaSel] = useState<number | 'todas'>('todas');
    const jornadaDe = useMemo(() => {
        const m = new Map<string, number>();
        (matches || []).forEach(mt => m.set(mt.id, Number(mt.jornada)));
        return m;
    }, [matches]);
    const jornadas = useMemo(() => {
        if (!matches) return [];
        const set = new Set<number>();
        tags.forEach(t => { const j = jornadaDe.get(t.match_id); if (j !== undefined && !isNaN(j)) set.add(j); });
        return Array.from(set).sort((a, b) => a - b);
    }, [tags, matches, jornadaDe]);
    const activa = jornadaSel !== 'todas' && !jornadas.includes(jornadaSel) ? 'todas' : jornadaSel;
    const visibles = useMemo(() => (activa === 'todas' ? tags : tags.filter(t => jornadaDe.get(t.match_id) === activa)), [tags, activa, jornadaDe]);

    const { conteo, con, max, mejor } = useMemo(() => {
        const c: Record<string, number> = {};
        let n = 0;
        visibles.forEach(t => { const p = detalleGolDe(t).porteria; if (p) { c[p] = (c[p] || 0) + 1; n++; } });
        let mx = 0; let best: string | null = null;
        ALTURAS.forEach(a => LADOS.forEach(l => { const k = codigoPorteria(a, l); if ((c[k] || 0) > mx) { mx = c[k]; best = k; } }));
        return { conteo: c, con: n, max: mx, mejor: best as string | null };
    }, [visibles]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-white">{titulo}</h3>
            {matches && jornadas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {(['todas', ...jornadas] as (number | 'todas')[]).map(j => (
                        <button
                            key={String(j)}
                            onClick={() => setJornadaSel(j)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${activa === j ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            {j === 'todas' ? 'Todas' : `J${j}`}
                        </button>
                    ))}
                </div>
            )}
            <div className="mx-auto w-full max-w-sm">
                <PorteriaEstadio conteo={conteo} rgb="251,146,60" />
            </div>
            <p className="text-xs text-gray-400 text-center">Portería vista de frente · alto, medio y bajo</p>
            {con === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay goles con portería marcada{activa !== 'todas' ? ` en J${activa}` : ''}.</p>
            ) : (
                <p className="text-sm text-gray-200"><span className="font-semibold">Lectura:</span> más goles en {(etiquetaPorteria(mejor) || '').toLowerCase()} ({mejor ? conteo[mejor] : 0}).</p>
            )}
            {con < visibles.length && <p className="text-xs text-gray-500">{con} de {visibles.length} goles tienen portería marcada.</p>}
        </div>
    );
};

export default MapaPorteria;
