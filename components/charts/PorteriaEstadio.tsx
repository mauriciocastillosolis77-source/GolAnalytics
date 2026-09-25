import React, { useId } from 'react';
import { ALTURAS, LADOS, ALTURA_LABEL, LADO_LABEL, codigoPorteria } from '../../utils/goles';

// ─────────────────────────────────────────────────────────────────────────────
// Portería "de estadio" (mejora 6): fondo azul, portería con red en perspectiva,
// pasto con líneas. Las 9 zonas (alto/medio/bajo × izquierda/centro/derecha,
// vista de frente) se marcan sobre la cara de la portería.
// - Para mostrar datos: pasa `conteo` (código de zona → número de goles).
// - Para elegir una zona (Etiquetador): pasa `onSelect` y `seleccion`.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    conteo?: Record<string, number>;
    rgb: string; // color de los goles, ej. "34,211,238"
    onSelect?: (codigo: string) => void;
    seleccion?: string | null;
}

const W = 320, H = 200;
const F = { x1: 46, x2: 274, y1: 34, y2: 132 };   // cara de la portería (postes, travesaño, línea de gol)
const B = { x1: 60, x2: 260, y1: 24, y2: 118 };   // marco de atrás (perspectiva)

const PorteriaEstadio: React.FC<Props> = ({ conteo = {}, rgb, onSelect, seleccion }) => {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const max = Math.max(1, ...Object.values(conteo).map(v => Number(v) || 0));
    const cw = (F.x2 - F.x1) / 3;
    const ch = (F.y2 - F.y1) / 3;
    const red = 'rgba(255,255,255,0.5)';

    const lineasRed: React.ReactNode[] = [];
    for (let x = B.x1; x <= B.x2; x += 10) lineasRed.push(<line key={`bv${x}`} x1={x} y1={B.y1} x2={x} y2={B.y2} />);
    for (let y = B.y1; y <= B.y2; y += 10) lineasRed.push(<line key={`bh${y}`} x1={B.x1} y1={y} x2={B.x2} y2={y} />);
    for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const yb = B.y1 + (B.y2 - B.y1) * t, yf = F.y1 + (F.y2 - F.y1) * t;
        lineasRed.push(<line key={`sl${k}`} x1={B.x1} y1={yb} x2={F.x1} y2={yf} />);
        lineasRed.push(<line key={`sr${k}`} x1={B.x2} y1={yb} x2={F.x2} y2={yf} />);
    }
    for (let k = 1; k < 3; k++) {
        const t = k / 3;
        lineasRed.push(<line key={`vl${k}`} x1={B.x1 + (F.x1 - B.x1) * t} y1={B.y1 + (F.y1 - B.y1) * t} x2={B.x1 + (F.x1 - B.x1) * t} y2={B.y2 + (F.y2 - B.y2) * t} />);
        lineasRed.push(<line key={`vr${k}`} x1={B.x2 + (F.x2 - B.x2) * t} y1={B.y1 + (F.y1 - B.y1) * t} x2={B.x2 + (F.x2 - B.x2) * t} y2={B.y2 + (F.y2 - B.y2) * t} />);
    }
    for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        lineasRed.push(<line key={`tp${k}`} x1={B.x1 + (B.x2 - B.x1) * t} y1={B.y1} x2={F.x1 + (F.x2 - F.x1) * t} y2={F.y1} />);
    }

    const franjas: React.ReactNode[] = [];
    for (let i = 1; i < 8; i += 2) franjas.push(<path key={`fr${i}`} d={`M${i * 40 - 20} ${H} L${i * 40 + 10} ${F.y2 - 6} L${i * 40 + 50} ${F.y2 - 6} L${i * 40 + 20} ${H}Z`} fill="rgba(255,255,255,0.05)" />);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Portería vista de frente">
            <defs>
                <linearGradient id={`cielo${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0b1a3a" /><stop offset=".7" stopColor="#12305c" /><stop offset="1" stopColor="#1d4d4f" /></linearGradient>
                <linearGradient id={`pasto${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1f8a3d" /><stop offset="1" stopColor="#0f5a27" /></linearGradient>
                <radialGradient id={`brillo${id}`}><stop offset="0" stopColor={`rgba(${rgb},0.9)`} /><stop offset="1" stopColor={`rgba(${rgb},0)`} /></radialGradient>
                <clipPath id={`recorte${id}`}><rect width={W} height={H} rx="12" /></clipPath>
            </defs>
            <g clipPath={`url(#recorte${id})`}>
                <rect width={W} height={H} fill={`url(#cielo${id})`} />
                <path d={`M0 ${F.y2 - 6} H${W} V${H} H0Z`} fill={`url(#pasto${id})`} />
                {franjas}
                <line x1="0" y1={F.y2} x2={W} y2={F.y2} stroke="rgba(255,255,255,.85)" strokeWidth="1.6" />
                <path d={`M18 ${F.y2 + 22} H${W - 18}`} stroke="rgba(255,255,255,.6)" strokeWidth="1.4" />
                <path d={`M18 ${F.y2} L8 ${F.y2 + 22} M${W - 18} ${F.y2} L${W - 8} ${F.y2 + 22}`} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
                <path d={`M110 ${H} Q160 ${F.y2 + 44} 210 ${H}`} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" />

                <g stroke={red} strokeWidth=".8">{lineasRed}</g>
                <path d={`M${B.x1} ${B.y2} V${B.y1} H${B.x2} V${B.y2}`} fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="2" />
                <line x1={B.x1} y1={B.y2} x2={F.x1} y2={F.y2} stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />
                <line x1={B.x2} y1={B.y2} x2={F.x2} y2={F.y2} stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />

                {[1, 2].map(i => (
                    <g key={`z${i}`} stroke="rgba(255,255,255,.35)" strokeDasharray="3 4">
                        <line x1={F.x1 + i * cw} y1={F.y1} x2={F.x1 + i * cw} y2={F.y2} />
                        <line x1={F.x1} y1={F.y1 + i * ch} x2={F.x2} y2={F.y1 + i * ch} />
                    </g>
                ))}

                {ALTURAS.map((a, r) => LADOS.map((l, i) => {
                    const k = codigoPorteria(a, l);
                    const v = conteo[k] || 0;
                    const cx = F.x1 + i * cw + cw / 2;
                    const cy = F.y1 + r * ch + ch / 2;
                    const elegida = seleccion === k;
                    return (
                        <g key={k}>
                            {elegida && <rect x={F.x1 + i * cw + 2} y={F.y1 + r * ch + 2} width={cw - 4} height={ch - 4} rx="4" fill={`rgba(${rgb},0.35)`} stroke={`rgb(${rgb})`} strokeWidth="2" />}
                            {v > 0 && (() => {
                                const rad = 9 + 6 * (v / max);
                                return (
                                    <>
                                        <circle cx={cx} cy={cy} r={rad + 9} fill={`url(#brillo${id})`} />
                                        <circle cx={cx} cy={cy} r={rad} fill={`rgb(${rgb})`} stroke="#fff" strokeWidth="1.8" />
                                        <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#0b1220">{v}</text>
                                    </>
                                );
                            })()}
                            <rect
                                x={F.x1 + i * cw} y={F.y1 + r * ch} width={cw} height={ch}
                                fill="transparent"
                                style={onSelect ? { cursor: 'pointer' } : undefined}
                                onClick={onSelect ? () => onSelect(k) : undefined}
                            >
                                <title>{`${ALTURA_LABEL[a]} ${LADO_LABEL[l].toLowerCase()}${v > 0 ? `: ${v}` : ''}`}</title>
                            </rect>
                        </g>
                    );
                }))}

                <path d={`M${F.x1} ${F.y2} V${F.y1} H${F.x2} V${F.y2}`} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" pointerEvents="none" />
            </g>
        </svg>
    );
};

export default PorteriaEstadio;
