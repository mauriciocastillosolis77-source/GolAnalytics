import React, { useMemo } from 'react';
import type { Tag } from '../../types';
import { TIPOS_GOL, TIPO_GOL_LABEL, detalleGolDe } from '../../utils/goles';
import PorteriaEstadio from './PorteriaEstadio';

// ─────────────────────────────────────────────────────────────────────────────
// Goles por tipo (mejora 6). Barras horizontales por tipo de gol.
// - Con `enContra`: compara a favor (cian) contra en contra (naranja).
// - Sin `enContra`: una sola serie (por ejemplo, los goles de un jugador).
// Los goles sin tipo marcado no se dibujan; se informan abajo.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    titulo: string;
    aFavor: Tag[];
    enContra?: Tag[];
    // Texto extra al final (por ejemplo, la línea de penales en la entrega 6).
    pie?: React.ReactNode;
    // Tablero: muestra al lado dos mini porterías, "Dónde anotamos" y "Dónde nos anotan".
    conPorterias?: boolean;
}

// Mini portería (vista de frente) dentro de la tarjeta, con el dibujo de estadio.
const PorteriaMini: React.FC<{ titulo: string; tags: Tag[]; rgb: string }> = ({ titulo, tags, rgb }) => {
    const conteo: Record<string, number> = {};
    let con = 0;
    tags.forEach(t => { const k = detalleGolDe(t).porteria; if (k) { conteo[k] = (conteo[k] || 0) + 1; con++; } });
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-sm text-gray-300 font-semibold">{titulo}</p>
            <PorteriaEstadio conteo={conteo} rgb={rgb} />
            <p className="text-xs text-gray-500">{con === 0 ? 'Sin portería marcada' : `${con} de ${tags.length} con portería marcada`}</p>
        </div>
    );
};

const contar = (tags: Tag[]) => {
    const c: Record<string, number> = {};
    let con = 0;
    tags.forEach(t => {
        const tipo = detalleGolDe(t).tipo_gol;
        if (tipo) { c[tipo] = (c[tipo] || 0) + 1; con++; }
    });
    return { c, con, total: tags.length };
};

const GolesPorTipo: React.FC<Props> = ({ titulo, aFavor, enContra, pie, conPorterias }) => {
    const fav = useMemo(() => contar(aFavor), [aFavor]);
    const con = useMemo(() => contar(enContra || []), [enContra]);
    const max = Math.max(1, ...TIPOS_GOL.map(t => Math.max(fav.c[t] || 0, con.c[t] || 0)));
    const comparar = !!enContra;
    const hayDatos = fav.con + con.con > 0;

    const barra = (v: number, color: string) => (
        <div className="flex items-center gap-2">
            <div className="h-3 rounded-r" style={{ width: `${v === 0 ? 0 : Math.max(4, (v / max) * 100)}%`, backgroundColor: color, maxWidth: 'calc(100% - 28px)' }} />
            <span className="text-sm text-gray-100 font-semibold">{v}</span>
        </div>
    );

    return (
        <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-white">{titulo}</h3>
            {comparar && (
                <div className="flex gap-4 text-xs text-gray-300">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22D3EE' }} />A favor</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#FB923C' }} />En contra</span>
                </div>
            )}
            <div className="flex flex-wrap gap-6">
            <div className="flex-1 min-w-[240px] flex flex-col gap-3">
            {!hayDatos ? (
                <p className="text-sm text-gray-400">Todavía no hay goles con tipo marcado.</p>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {TIPOS_GOL.map(t => (
                        <div key={t} className="grid items-center gap-3" style={{ gridTemplateColumns: '130px minmax(0, 1fr)' }}>
                            <span className="text-sm text-gray-300">{TIPO_GOL_LABEL[t]}</span>
                            <div className="flex flex-col gap-1">
                                {barra(fav.c[t] || 0, '#22D3EE')}
                                {comparar && barra(con.c[t] || 0, '#FB923C')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {(fav.con < fav.total || con.con < con.total) && (
                <p className="text-xs text-gray-500">
                    {comparar
                        ? `Con tipo marcado: ${fav.con} de ${fav.total} a favor · ${con.con} de ${con.total} en contra.`
                        : `${fav.con} de ${fav.total} goles tienen tipo marcado.`}
                </p>
            )}
            </div>
            {conPorterias && (
                <div className="w-full sm:w-[240px] flex flex-col gap-4">
                    <PorteriaMini titulo="Dónde anotamos" tags={aFavor} rgb="34,211,238" />
                    <PorteriaMini titulo="Dónde nos anotan" tags={enContra || []} rgb="251,146,60" />
                    <p className="text-xs text-gray-500">Porterías vistas de frente</p>
                </div>
            )}
            </div>
            {pie}
        </div>
    );
};

export default GolesPorTipo;
