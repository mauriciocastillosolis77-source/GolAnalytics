// ─────────────────────────────────────────────────────────────────────────────
// Modelo de juego (mejora 3). Opción B aprobada: lista de pilares por equipo,
// cada uno con FASE y ZONA opcional (así después puede crecer a la opción A,
// con subprincipios, sin perder lo calificado). Se califica en cada partido
// (semáforo + nota) y el seguimiento mensual junta los partidos de cada mes.
// Tablas en Supabase: modelo_pilares y modelo_calificaciones (ver el SQL de la entrega).
// ─────────────────────────────────────────────────────────────────────────────

export type Semaforo = 'verde' | 'ambar' | 'rojo';

export const FASES = [
    'General',
    'Ataque organizado',
    'Defensa organizada',
    'Transición ofensiva',
    'Transición defensiva',
    'Balón parado',
] as const;
export type Fase = typeof FASES[number];

export const ZONAS_MODELO = ['Inicio', 'Creación', 'Finalización'] as const;

export interface ModeloPilar {
    id: string;
    team_id: string;
    nombre: string;
    fase: string;
    zona: string | null;
    orden: number;
    activo: boolean;
    subprincipios?: string[] | null; // para la opción A, más adelante
    created_at?: string;
}

export interface ModeloCalificacion {
    id?: string;
    match_id: string;
    pilar_id: string;
    semaforo: Semaforo;
    nota: string | null;
    updated_at?: string;
}

// Los 8 pilares que hoy se usan en Generar Reportes, con fase y zona sugeridas
// (tal como se aprobó en el mockup). Se usan para crear el modelo la primera vez.
export const PILARES_SUGERIDOS: { nombre: string; fase: Fase; zona: string | null }[] = [
    { nombre: '4-4-2 / 4-3-3', fase: 'General', zona: null },
    { nombre: 'Presión bloque alto', fase: 'Defensa organizada', zona: null },
    { nombre: 'Amplitud priorizada', fase: 'Ataque organizado', zona: null },
    { nombre: 'Salida combinativa', fase: 'Ataque organizado', zona: 'Inicio' },
    { nombre: 'Creación por 3er hombre', fase: 'Ataque organizado', zona: 'Creación' },
    { nombre: 'Definición según la jugada', fase: 'Ataque organizado', zona: 'Finalización' },
    { nombre: 'ABP ofensivo prefabricado', fase: 'Balón parado', zona: null },
    { nombre: 'ABP defensivo: decisión del equipo', fase: 'Balón parado', zona: null },
];

export const SEMAFORO_LABEL: Record<Semaforo, string> = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo' };
export const SEMAFORO_COLOR: Record<Semaforo, string> = { verde: '#16A34A', ambar: '#CA8A04', rojo: '#DC2626' };

const ordenFase = (f: string) => { const i = (FASES as readonly string[]).indexOf(f); return i === -1 ? FASES.length : i; };

// Agrupa pilares por fase, en el orden de FASES (y por `orden` dentro de cada fase).
export const agruparPorFase = <T extends { fase: string; orden: number }>(pilares: T[]): { fase: string; pilares: T[] }[] => {
    const mapa = new Map<string, T[]>();
    [...pilares].sort((a, b) => ordenFase(a.fase) - ordenFase(b.fase) || a.orden - b.orden).forEach(p => {
        if (!mapa.has(p.fase)) mapa.set(p.fase, []);
        mapa.get(p.fase)!.push(p);
    });
    return Array.from(mapa.entries()).map(([fase, ps]) => ({ fase, pilares: ps }));
};

// "2026-10" a partir de la fecha del partido.
export const claveMes = (fecha: string | null | undefined): string | null => {
    if (!fecha) return null;
    const m = String(fecha).match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : null;
};
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const etiquetaMes = (clave: string, largo = false): string => {
    const [y, m] = clave.split('-').map(Number);
    return `${(largo ? MESES_LARGO : MESES)[m - 1]}${largo ? ` ${y}` : ''}`;
};

// Resumen de un pilar en un mes: el semáforo que más se repitió (empate → el peor)
// y cuántos partidos salieron en verde de los calificados.
export interface ResumenCelda { color: Semaforo; verdes: number; calificados: number; }
export const resumirCelda = (califs: ModeloCalificacion[]): ResumenCelda | null => {
    if (califs.length === 0) return null;
    const n: Record<Semaforo, number> = { verde: 0, ambar: 0, rojo: 0 };
    califs.forEach(c => { n[c.semaforo]++; });
    const max = Math.max(n.verde, n.ambar, n.rojo);
    const color: Semaforo = n.rojo === max ? 'rojo' : n.ambar === max ? 'ambar' : 'verde';
    return { color, verdes: n.verde, calificados: califs.length };
};
