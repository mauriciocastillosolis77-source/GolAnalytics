import React, { useMemo, useState } from 'react';
import type { Tag, Match } from '../../types';
import { ALTURAS, LADOS, ALTURA_LABEL, LADO_LABEL, codigoPorteria, detalleGolDe, etiquetaPorteria } from '../../utils/goles';

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
                <div className="grid grid-cols-3 gap-1 p-1 border-4 border-b-0 border-gray-100 rounded-t" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
                    {ALTURAS.map(a => LADOS.map(l => {
                        const k = codigoPorteria(a, l);
                        const v = conteo[k] || 0;
                        const alpha = max > 0 && v > 0 ? 0.25 + 0.65 * (v / max) : 0;
                        return (
                            <div key={k} className="h-12 rounded flex items-center justify-center" style={{ backgroundColor: `rgba(251,146,60,${alpha.toFixed(2)})` }} title={`${ALTURA_LABEL[a]} ${LADO_LABEL[l].toLowerCase()}: ${v}`}>
                                {v > 0 && <span className="min-w-[28px] h-7 px-2 rounded-full bg-gray-900/80 text-white text-sm font-bold flex items-center justify-center">{v}</span>}
                            </div>
                        );
                    }))}
                </div>
                <div className="h-2 bg-green-800 rounded-b" />
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
