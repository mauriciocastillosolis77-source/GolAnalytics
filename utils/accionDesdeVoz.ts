// ─────────────────────────────────────────────────────────────────────────────
// Autocorrector de acciones dictadas por voz (Etiquetador).
//
// El reconocedor a veces cambia una palabra ("pase al cuarto ofensivo logrado",
// "hero defensivo fallado", "recuperación de valor", "uno con uno..."). Como las
// acciones son una lista cerrada (METRICS), aquí no se busca la frase tal cual:
// se reconoce cada palabra clave (aunque venga mal escrita) y con ellas se arma
// la acción.
//
// Regla de seguridad: NUNCA se adivina lo que cambia el dato. Si no queda claro
// si fue corto/largo, ofensivo/defensivo o logrado/fallado, no devuelve acción
// y dice qué faltó, para no ensuciar las estadísticas con una etiqueta equivocada.
// ─────────────────────────────────────────────────────────────────────────────
import { METRICS } from '../constants';

export interface AccionVoz {
    accion: string | null;   // nombre exacto de METRICS, o null si no quedó claro
    duda?: string;           // qué faltó o qué se confundió (para mostrarlo en pantalla)
}

// Palabra clave → formas en que la escribe el reconocedor (sin acentos).
// Para agregar una confusión nueva basta con añadirla a la lista que corresponda.
const VOCABULARIO: Record<string, string[]> = {
    corto: ['corto', 'cortos', 'corta', 'cuarto', 'cuartos'],
    largo: ['largo', 'largos', 'larga'],
    aereo: ['aereo', 'aereos', 'aerea', 'areo', 'hereo', 'ereo', 'hero', 'heroe', 'heroes', 'area'],
    defensivo: ['defensivo', 'defensiva', 'defensivos', 'defensivas'],
    ofensivo: ['ofensivo', 'ofensiva', 'ofensivos', 'ofensivas'],
    logrado: ['logrado', 'lograda', 'logrados', 'logradas', 'logro'],
    fallado: ['fallado', 'fallada', 'fallados', 'falladas', 'fayado', 'fayada', 'falado', 'fallo', 'fayo'],
    transicion: ['transicion', 'transiciones'],
    recuperacion: ['recuperacion', 'recuperaciones', 'recupera', 'recuperado', 'recuperada'],
    perdida: ['perdida', 'perdidas', 'perdido'],
    balon: ['balon', 'balones', 'valor'],
    tiro: ['tiro', 'tiros'],
    porteria: ['porteria', 'porterias', 'puerta', 'arco'],
    gol: ['gol', 'goles'],
    favor: ['favor'],
    recibidos: ['recibidos', 'recibido', 'recibida', 'recibidas'],
    atajadas: ['atajadas', 'atajada', 'atajado', 'atajados', 'atajo', 'tajadas'],
};

const ALIAS = new Map<string, string>();
Object.entries(VOCABULARIO).forEach(([clave, formas]) => formas.forEach(f => ALIAS.set(f, clave)));

// Palabras que también se aceptan "parecidas" (una o dos letras cambiadas).
// Las cortas (tiro, gol, favor, balón) solo se aceptan por la lista de arriba.
const PARECIDAS = ['corto', 'largo', 'aereo', 'defensivo', 'ofensivo', 'logrado', 'fallado', 'transicion', 'recuperacion', 'perdida', 'porteria', 'recibidos'];

const limpiar = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Número de letras que hay que cambiar para pasar de una palabra a otra.
const distancia = (a: string, b: string): number => {
    const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = fila[0];
        fila[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const arriba = fila[j];
            fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = arriba;
        }
    }
    return fila[b.length];
};

// Devuelve la palabra clave que corresponde a lo escuchado, o null.
// `parecida` = true cuando no estaba en la lista y se aceptó por parecido.
const palabraClave = (token: string): { clave: string; parecida: boolean } | null => {
    const directa = ALIAS.get(token);
    if (directa) return { clave: directa, parecida: false };
    if (token.length < 4) return null;
    const cercanas = PARECIDAS
        .map(clave => ({ clave, d: distancia(token, clave) }))
        .sort((x, y) => x.d - y.d);
    const [mejor, segunda] = cercanas;
    const maximo = mejor.clave.length <= 6 ? 1 : 2;
    // Tiene que parecerse claramente a UNA sola palabra: si queda cerca de dos
    // (p. ej. "efensivo" entre ofensivo y defensivo) no se adivina.
    if (mejor.d <= maximo && segunda.d - mejor.d >= 2) return { clave: mejor.clave, parecida: true };
    return null;
};

const NOMBRE_TIPO: Record<string, string> = { corto: 'Pase corto', largo: 'Pase largo', unovsuno: '1 vs 1', aereo: 'Aéreo' };

export const accionDesdeVoz = (texto: string): AccionVoz => {
    // "uno con uno", "uno contra uno", "1 vs 1", "uno a uno", "1 1"… → una sola palabra
    const t = limpiar(texto).replace(/\b(1|uno|un|una) ?(vs|versus|contra|con|a|v|x|por|y)? ?(1|uno|una)\b/g, ' unovsuno ');
    const tokens = t.split(' ').filter(Boolean);

    const claves = new Set<string>();
    const soloParecidas = new Set<string>();
    tokens.forEach((token, i) => {
        if (token === 'unovsuno') { claves.add('unovsuno'); return; }
        const p = palabraClave(token);
        if (!p) return;
        // "no logrado" / "no lograda" cuenta como fallado
        const clave = p.clave === 'logrado' && tokens[i - 1] === 'no' ? 'fallado' : p.clave;
        if (p.parecida && !claves.has(clave)) soloParecidas.add(clave);
        if (!p.parecida) soloParecidas.delete(clave);
        claves.add(clave);
    });
    const tiene = (c: string) => claves.has(c);

    const tipos = ['corto', 'largo', 'unovsuno', 'aereo'].filter(tiene);
    const fases = ['defensivo', 'ofensivo'].filter(tiene);
    const logrado = tiene('logrado');
    const fallado = tiene('fallado');

    const candidatas: string[] = [];
    let duda = '';

    if (tiene('transicion')) {
        if (tipos.length > 0 || tiene('defensivo')) duda = 'escuché dos acciones distintas';
        else if (logrado === fallado) duda = '¿lograda o no lograda?';
        else candidatas.push(fallado ? 'Transición ofensiva no lograda' : 'Transición ofensiva lograda');
    } else if (tipos.length > 0 || (fases.length > 0 && (logrado || fallado))) {
        // Pases, 1 vs 1 y aéreos: hacen falta las tres partes y sin contradicciones.
        if (tipos.length === 0) duda = '¿pase corto, pase largo, 1 vs 1 o aéreo?';
        else if (tipos.length > 1) duda = 'escuché dos tipos de acción';
        else if (fases.length !== 1) duda = '¿ofensivo o defensivo?';
        else if (logrado === fallado) duda = '¿logrado o fallado?';
        else candidatas.push(`${NOMBRE_TIPO[tipos[0]]} ${fases[0]} ${fallado ? 'fallado' : 'logrado'}`);
    }

    // Si la palabra principal solo se aceptó "por parecido", se exige además "balón".
    if (tiene('recuperacion') && (!soloParecidas.has('recuperacion') || tiene('balon'))) candidatas.push('Recuperación de balón');
    if (tiene('perdida') && (!soloParecidas.has('perdida') || tiene('balon'))) candidatas.push('Pérdida de balón');
    if (tiene('tiro') && tiene('porteria')) candidatas.push('Tiros a portería');
    if (tiene('gol')) {
        const aFavor = tiene('favor');
        const recibido = tiene('recibidos') || /\ben contra\b/.test(t);
        if (aFavor && !recibido) candidatas.push('Goles a favor');
        else if (recibido && !aFavor) candidatas.push('Goles recibidos');
        else if (!duda) duda = '¿gol a favor o recibido?';
    }
    if (tiene('atajadas')) candidatas.push('Atajadas');

    const validas = Array.from(new Set(candidatas)).filter(c => METRICS.includes(c));
    if (validas.length === 1) return { accion: validas[0] };
    if (validas.length > 1) return { accion: null, duda: 'escuché dos acciones distintas' };
    return duda ? { accion: null, duda } : { accion: null };
};
