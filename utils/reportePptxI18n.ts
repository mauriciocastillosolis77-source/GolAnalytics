// ─────────────────────────────────────────────────────────────────────────────
// Textos fijos del PowerPoint del partido (Análisis Ejecutivo Post Partido),
// en español y en inglés.
//
// · El español es EXACTAMENTE el que ya tenía el PowerPoint: no se cambió ni
//   una letra.
// · El inglés es el del fútbol internacional (football, pitch, match,
//   matchday), escrito como se habla de fútbol, no palabra por palabra.
// · Aquí va lo fijo y las frases que arma la plataforma con los datos. Lo que
//   escribe la IA o el usuario lo traduce services/traduccionService.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Idioma } from './scoutingI18n';
import { TERCIO_LABEL, CARRIL_LABEL, etiquetaZona, type Tercio, type Carril } from './zonas';
import { resumenGol, type DetalleGol } from './goles';
import { ENVIO_LABEL, type Envio } from './balonParado';

const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ── Español (idéntico al de siempre) ────────────────────────────────────────
const ES = {
  locale: 'es-MX',
  sufijoArchivo: '',
  // Portada
  reporteDePartido: 'REPORTE DE PARTIDO',
  jornadaLinea: (jornada: number | string, torneo: string, categoria: string, fecha: string) => `Jornada ${jornada}  ·  ${torneo} (${categoria})  ·  ${fecha}`,
  marcadorFinal: 'Marcador Final',
  preparadoPor: (autor?: string) => `Preparado por GolAnalytics${autor ? `  ·  ${autor}` : ''}`,
  // Resumen ejecutivo
  resumenKicker: 'Resumen ejecutivo',
  resumenTitulo: 'Los highlights del partido',
  efectividadGeneralMayus: 'EFECTIVIDAD GENERAL   ',
  vsPromedio: (p: number) => `vs. ${p}% promedio del equipo en el torneo`,
  statEfectividad: 'Efectividad general',
  statRecuperaciones: 'Recuperaciones de balón',
  statTiros: 'Tiros a portería · conversión',
  statTransiciones: 'Transiciones ofensivas logradas',
  lecturaDelPartido: 'Lectura del partido',
  // Efectividad por línea
  rendimiento: 'Rendimiento',
  efectividadPorLinea: 'Efectividad por línea',
  defensa: 'DEFENSA', medio: 'MEDIOCAMPO', ataque: 'ATAQUE',
  // Estilo de juego
  rendimientoTactico: 'Rendimiento táctico',
  comoJugamos: 'Cómo jugamos — estilo de este partido',
  faseOfensivaPropia: 'Fase ofensiva · ¿Cómo atacamos cuando tenemos el balón?',
  faseDefensivaPropia: 'Fase defensiva · ¿Cómo presionamos cuando no tenemos el balón?',
  zonasCancha: ['Inicio', 'Creación', 'Finalización'],
  estiloConstruccion: 'Estilo de construcción',
  carrilDominante: 'Carril dominante',
  bloquePresion: 'Bloque de presión',
  // Estilo de juego calculado
  estiloSinPases: 'Sin pases suficientes registrados',
  estiloMixto: (c: number, d: number) => `Mixto (${c}% combinativo / ${d}% directo)`,
  estiloCombinativo: (c: number) => `Combinativo (${c}% pases cortos)`,
  estiloDirecto: (d: number) => `Directo (${d}% pases largos)`,
  carrilNoDisponible: 'No disponible — sube el Excel con posiciones detalladas (lateral izquierdo/derecho) para calcularlo.',
  carrilRepartido: (izq: number) => `Repartido por igual entre ambos costados (${izq}% izquierda / ${100 - izq}% derecha).`,
  carrilIzquierda: (izq: number) => `Predominantemente por la izquierda (${izq}% de los pases de jugadores de banda).`,
  carrilDerecha: (der: number) => `Predominantemente por la derecha (${der}% de los pases de jugadores de banda).`,
  carrilSinLaterales: 'El Excel no trae jugadores con posición lateral (izquierda/derecha) que hayan participado en pases.',
  bloqueSinDatos: 'Sin suficientes 1 vs 1 defensivos ganados con posición registrada.',
  bloqueCalculado: (altura: 'alto' | 'medio' | 'bajo', pct: number, grupo: 'Delantero' | 'Medio' | 'Defensa') =>
    `Bloque ${altura} (${pct}% de los 1 vs 1 defensivos ganados fueron de jugadores de ${grupo.toLowerCase()}).`,
  // Dónde recuperamos y dónde perdimos
  dondeRecuperamosYPerdimos: 'Dónde recuperamos y dónde perdimos',
  dondeRecuperamos: 'Dónde recuperamos',
  dondePerdimos: 'Dónde perdimos',
  recuperaciones: 'recuperaciones',
  perdidas: 'pérdidas',
  tercio: (t: Tercio) => TERCIO_LABEL[t],
  carril: (c: Carril) => CARRIL_LABEL[c],
  atacaDerecha: 'Nuestro equipo ataca hacia la derecha →',
  sinZonaMarcada: (nombre: string) => `Sin ${nombre} con zona marcada en este partido.`,
  masEnZona: (nombre: string, zona: string | null, n: number) => `Más ${nombre} en ${zona} (${n}).`,
  conZonaMarcada: (con: number, total: number, nombre: string) => `${con} de ${total} ${nombre} tienen zona marcada.`,
  etiquetaZona: (codigo: string | null) => etiquetaZona(codigo),
  // Goles
  goles: 'Goles',
  golesDelPartido: 'Goles del partido',
  minuto: (m: number) => `Min ${m}`,
  jugador: 'Jugador',
  sinDetalle: ' · sin detalle',
  aFavor: 'A FAVOR',
  enContra: 'EN CONTRA',
  yMas: (n: number) => `y ${n} más`,
  dondeMetimos: 'Dónde metimos los goles',
  dondeNosMetieron: 'Dónde nos metieron los goles',
  resumenGol: (d: DetalleGol) => resumenGol(d),
  // Balón parado (del partido)
  balonParado: 'Balón parado',
  balonParadoYPenales: 'Balón parado y penales',
  cobrosRematesGoles: 'cobros → remates → goles',
  bpAFavor: 'A FAVOR',
  bpEnContra: 'EN CONTRA',
  corners: 'Córners',
  tirosLibres: 'Tiros libres',
  penales: (goles: number, tirados: number) => `Penales: ${tirados === 0 ? 'ninguno' : `${goles} anotado${goles === 1 ? '' : 's'} de ${tirados}`}`,
  envioMasUsado: (envio: Envio, n: number) => `Zona de envío más usada: ${ENVIO_LABEL[envio].toLowerCase()} (${n})`,
  envioSinMarcar: 'Zona de envío: sin marcar',
  remataNota: 'Remates incluye los que terminaron en gol. Solo se cuenta: no cambia la efectividad del partido.',
  // Modelo de juego
  semaforo: { verde: 'Se cumplió', ambar: 'A medias', rojo: 'No se cumplió' } as Record<string, string>,
  analisisTactico: 'Análisis táctico',
  modeloEjecutado: (pagina: string) => `Modelo de juego — ¿se ejecutó en este partido?${pagina}`,
  // Jugadores destacados
  rendimientoIndividual: 'Rendimiento individual',
  jugadoresDestacados: 'Jugadores destacados',
  accionesEfectividad: (acciones: number, efectividad: number | null) => `${acciones} acciones${efectividad !== null ? ` · ${efectividad}% efectividad` : ''}`,
  // Fortalezas y debilidades
  conclusionPartido: 'Conclusión del partido',
  fortalezasYDebilidades: 'Fortalezas y debilidades en este partido',
  fortalezas: 'FORTALEZAS',
  debilidades: 'DEBILIDADES',
  sinDatosSuficientes: 'Sin datos suficientes.',
  // Qué corregir
  recomendacionesEntrenamiento: 'Recomendaciones de entrenamiento',
  queCorregir: 'Qué corregir de este partido',
  // Sección 2 — próximo rival
  proximoRivalMayus: 'PRÓXIMO RIVAL',
  elProximoRival: 'el próximo rival',
  analisisDelRivalFecha: (fecha: string) => `Análisis del rival${fecha ? `  ·  ${fecha}` : ''}`,
  sinAnalisisRival: 'Este reporte no incluye el análisis de rival del siguiente partido.',
  proximoRival: 'Próximo rival',
  analisisDelRival: (rival: string) => `Análisis del rival — ${rival}`,
  faseOfensivaRival: 'Fase ofensiva · ¿Cómo ataca el rival cuando tiene el balón?',
  faseDefensivaRival: 'Fase defensiva · ¿Cómo presiona el rival cuando no tiene el balón?',
  zonaRival: { Inicio: 'Inicio', Creacion: 'Creación', Finalizacion: 'Finalización' } as Record<string, string>,
  notaAnalistaEnLinea: (nota: string) => `  ·  Nota del analista: ${nota}`,
  notaAnalista: (nota: string) => `Nota del analista: ${nota}`,
  rivalBalonParado: 'Análisis del rival — Balón parado',
  rivalBalonParadoCont: 'Análisis del rival — Balón parado (continuación)',
  cuandoCobra: 'Cuando cobra',
  sinCobros: 'Sin cobros registrados todavía.',
  cornersCobra: (n: number) => `Córners — cuando cobra (${n})`,
  tirosLibresCobra: (n: number) => `Tiros libres — cuando cobra (${n})`,
  penalesCobra: (n: number) => `Penales — cuando cobra (${n})`,
  notaAnalistaCobra: 'Nota del analista — cuando cobra',
  cuandoDefiende: 'Cuando defiende',
  sinCobrosDefendidos: 'Sin cobros del rival defendidos todavía.',
  jugadoresClaveRival: 'Jugadores clave del rival',
  jugadoresClaveRivalCont: 'Jugadores clave del rival (continuación)',
  jugadorClave: 'Jugador clave',
  sinMotivo: 'Sin motivo capturado.',
  dafoRival: (rival: string) => `DAFO del rival — ${rival}`,
  dafoRivalCont: (rival: string) => `DAFO del rival — ${rival} (continuación)`,
  dafoFortalezas: 'FORTALEZAS', dafoDebilidades: 'DEBILIDADES', dafoOportunidades: 'OPORTUNIDADES', dafoAmenazas: 'AMENAZAS',
  dafoDe: (rival: string) => `de ${rival}`,
  paraNosotros: 'para nosotros',
  dafoGenerado: (fecha: string, momentos: number, partidos: number) =>
    `Generado con IA en Análisis del Rival${fecha ? ` el ${fecha}` : ''} · con ${momentos} momentos del rival y ${partidos} partido${partidos === 1 ? '' : 's'} contra él.`,
  planPartido: (rival: string) => `Plan de partido para enfrentar a ${rival}`,
  planPartidoCont: (rival: string) => `Plan de partido para enfrentar a ${rival} (continuación)`,
  planAdaptaciones: (equipo: string) => `Adaptaciones tácticas (recomendaciones que se dan a ${equipo})`,
  planAbpOfensivo: 'ABP ofensivo (cómo aprovechar nuestras acciones a balón parado)',
  planAbpDefensivo: 'ABP defensivo (cómo defendernos en las ABP en contra)',
  trabajoSemana: 'Próximo rival · trabajo de la semana',
  quePreparar: (rival: string) => `Qué preparar para enfrentar a ${rival}`,
  temasNota: 'Esto no es un ejercicio armado — son objetivos derivados de los datos del rival; tú decides el ejercicio.',
  alineacionTitulo: (rival: string) => `Alineación sugerida contra ${rival}`,
  sistema: (f: string) => `Sistema 1-${f}`,
  porQue: 'POR QUÉ',
  sinMotivos: 'Sin comentarios por puesto.',
  // Cierre
  quieresProfundizar: '¿Quieres profundizar?',
  cierreTexto: 'Este resumen es un extracto. El análisis completo — video por jugada, comparativo histórico y reporte de rendimiento con IA — está siempre disponible en la plataforma.',
  cierreLinks: ['app.golanalytics.com → Rendimiento', 'app.golanalytics.com → Análisis Táctico', 'app.golanalytics.com → Análisis del Rival'],
  whatsapp: 'Cualquier duda, escríbeme por WhatsApp',
};

export type TextosPptx = typeof ES;

// ── Inglés ──────────────────────────────────────────────────────────────────
const TERCIO_EN: Record<Tercio, string> = { inicio: 'Build-up', creacion: 'Creation', finalizacion: 'Finishing' };
const CARRIL_EN: Record<Carril, string> = { izquierda: 'Left', centro: 'Centre', derecha: 'Right' };
const TIPO_GOL_EN: Record<string, string> = { combinativo: 'Combination play', directo: 'Direct play', contraataque: 'Counter-attack', robo: 'High turnover', balon_parado: 'Set piece' };
const GOLPEO_EN: Record<string, string> = { pie_derecho: 'right foot', pie_izquierdo: 'left foot', cabeza: 'header' };
const ALTURA_EN: Record<string, string> = { alto: 'top', medio: 'middle', bajo: 'bottom' };
const LADO_EN: Record<string, string> = { izquierda: 'left', centro: 'centre', derecha: 'right' };
const ENVIO_EN: Record<string, string> = { primer_palo: 'near post', segundo_palo: 'far post', area_chica: 'six-yard box', punto_penal: 'penalty spot', frontal: 'edge of the box', corto: 'short' };

/** "bajo-izquierda" → "bottom left" (portería vista de frente, como la ve el que tira). */
export function porteriaEn(codigo?: string | null): string {
  if (!codigo) return '';
  const [a, l] = codigo.split('-');
  if (!ALTURA_EN[a] || !LADO_EN[l]) return '';
  return a === 'medio' && l === 'centro' ? 'centre of the goal' : `${ALTURA_EN[a]} ${LADO_EN[l]}`;
}

const EN: TextosPptx = {
  locale: 'en-GB',
  sufijoArchivo: '_EN',
  reporteDePartido: 'MATCH REPORT',
  jornadaLinea: (jornada, torneo, categoria, fecha) => `Matchday ${jornada}  ·  ${torneo} (${categoria})  ·  ${fecha}`,
  marcadorFinal: 'Final score',
  preparadoPor: (autor) => `Prepared by GolAnalytics${autor ? `  ·  ${autor}` : ''}`,
  resumenKicker: 'Executive summary',
  resumenTitulo: 'Match highlights',
  efectividadGeneralMayus: 'OVERALL SUCCESS RATE   ',
  vsPromedio: (p) => `vs. ${p}% team average in the competition`,
  statEfectividad: 'Overall success rate',
  statRecuperaciones: 'Ball recoveries',
  statTiros: 'Shots on target · conversion',
  statTransiciones: 'Successful attacking transitions',
  lecturaDelPartido: 'Match overview',
  rendimiento: 'Performance',
  efectividadPorLinea: 'Success rate by unit',
  defensa: 'DEFENCE', medio: 'MIDFIELD', ataque: 'ATTACK',
  rendimientoTactico: 'Tactical performance',
  comoJugamos: 'How we played — our style in this match',
  faseOfensivaPropia: 'In possession · How do we attack when we have the ball?',
  faseDefensivaPropia: "Out of possession · How do we press when we don't have the ball?",
  zonasCancha: ['Build-up', 'Creation', 'Finishing'],
  estiloConstruccion: 'Build-up style',
  carrilDominante: 'Main channel',
  bloquePresion: 'Pressing block',
  estiloSinPases: 'Not enough passes logged',
  estiloMixto: (c, d) => `Mixed (${c}% combination play / ${d}% direct)`,
  estiloCombinativo: (c) => `Combination play (${c}% short passes)`,
  estiloDirecto: (d) => `Direct (${d}% long passes)`,
  carrilNoDisponible: 'Not available — upload the Excel file with detailed positions (left/right full-back) to calculate it.',
  carrilRepartido: (izq) => `Split evenly between both flanks (${izq}% left / ${100 - izq}% right).`,
  carrilIzquierda: (izq) => `Mainly down the left (${izq}% of passes by wide players).`,
  carrilDerecha: (der) => `Mainly down the right (${der}% of passes by wide players).`,
  carrilSinLaterales: 'The Excel file has no wide players (left/right) involved in passes.',
  bloqueSinDatos: 'Not enough defensive 1v1s won by players with a recorded position.',
  bloqueCalculado: (altura, pct, grupo) =>
    `${({ alto: 'High', medio: 'Mid', bajo: 'Low' } as const)[altura]} block (${pct}% of defensive 1v1s won were by ${({ Delantero: 'forwards', Medio: 'midfielders', Defensa: 'defenders' } as const)[grupo]}).`,
  dondeRecuperamosYPerdimos: 'Where we won and lost the ball',
  dondeRecuperamos: 'Where we won it back',
  dondePerdimos: 'Where we lost it',
  recuperaciones: 'ball recoveries',
  perdidas: 'losses of possession',
  tercio: (t) => TERCIO_EN[t],
  carril: (c) => CARRIL_EN[c],
  atacaDerecha: 'We attack from left to right →',
  sinZonaMarcada: (nombre) => `No ${nombre} with a zone marked in this match.`,
  masEnZona: (nombre, zona, n) => `Most ${nombre} in ${zona} (${n}).`,
  conZonaMarcada: (con, total, nombre) => `${con} of ${total} ${nombre} have a zone marked.`,
  etiquetaZona: (codigo) => {
    if (!codigo) return null;
    const [t, c] = codigo.split('-') as [Tercio, Carril];
    if (!TERCIO_EN[t] || !CARRIL_EN[c]) return null;
    return `${TERCIO_EN[t]} · ${CARRIL_EN[c].toLowerCase()}`;
  },
  goles: 'Goals',
  golesDelPartido: 'Goals in this match',
  minuto: (m) => `Min ${m}`,
  jugador: 'Player',
  sinDetalle: ' · no detail',
  aFavor: 'SCORED',
  enContra: 'CONCEDED',
  yMas: (n) => `and ${n} more`,
  dondeMetimos: 'Where we scored',
  dondeNosMetieron: 'Where we conceded',
  resumenGol: (d) => {
    const partes: string[] = [];
    if (d.tipo_gol) partes.push(TIPO_GOL_EN[d.tipo_gol] || d.tipo_gol);
    if (d.area) partes.push(d.area === 'dentro' ? 'inside the box' : 'outside the box');
    if (d.porteria) partes.push(porteriaEn(d.porteria));
    if (d.golpeo) partes.push(GOLPEO_EN[d.golpeo] || d.golpeo);
    return partes.length ? partes.join(' · ') : null;
  },
  balonParado: 'Set pieces',
  balonParadoYPenales: 'Set pieces and penalties',
  cobrosRematesGoles: 'taken → shots → goals',
  bpAFavor: 'FOR',
  bpEnContra: 'AGAINST',
  corners: 'Corners',
  tirosLibres: 'Free kicks',
  penales: (goles, tirados) => `Penalties: ${tirados === 0 ? 'none' : `${goles} scored out of ${tirados}`}`,
  envioMasUsado: (envio, n) => `Most common delivery: ${ENVIO_EN[envio] || envio} (${n})`,
  envioSinMarcar: 'Delivery: not marked',
  remataNota: 'Shots include those that ended in a goal. Count only: it does not change the match success rate.',
  semaforo: { verde: 'Achieved', ambar: 'Partly achieved', rojo: 'Not achieved' },
  analisisTactico: 'Tactical analysis',
  modeloEjecutado: (pagina) => `Game model — did we carry it out in this match?${pagina}`,
  rendimientoIndividual: 'Individual performance',
  jugadoresDestacados: 'Standout players',
  accionesEfectividad: (acciones, efectividad) => `${acciones} ${pl(acciones, 'action', 'actions')}${efectividad !== null ? ` · ${efectividad}% success rate` : ''}`,
  conclusionPartido: 'Match conclusions',
  fortalezasYDebilidades: 'Strengths and weaknesses in this match',
  fortalezas: 'STRENGTHS',
  debilidades: 'WEAKNESSES',
  sinDatosSuficientes: 'Not enough data.',
  recomendacionesEntrenamiento: 'Training recommendations',
  queCorregir: 'What to fix from this match',
  proximoRivalMayus: 'NEXT OPPONENT',
  elProximoRival: 'the next opponent',
  analisisDelRivalFecha: (fecha) => `Opposition analysis${fecha ? `  ·  ${fecha}` : ''}`,
  sinAnalisisRival: 'This report does not include an analysis of the next opponent.',
  proximoRival: 'Next opponent',
  analisisDelRival: (rival) => `Opposition analysis — ${rival}`,
  faseOfensivaRival: 'In possession · How does the opposition attack when they have the ball?',
  faseDefensivaRival: 'Out of possession · How does the opposition press when they do not have the ball?',
  zonaRival: { Inicio: 'Build-up', Creacion: 'Creation', Finalizacion: 'Finishing' },
  notaAnalistaEnLinea: (nota) => `  ·  Analyst's note: ${nota}`,
  notaAnalista: (nota) => `Analyst's note: ${nota}`,
  rivalBalonParado: 'Opposition analysis — Set pieces',
  rivalBalonParadoCont: 'Opposition analysis — Set pieces (continued)',
  cuandoCobra: 'When they take them',
  sinCobros: 'No set pieces taken logged yet.',
  cornersCobra: (n) => `Corners — when they take them (${n})`,
  tirosLibresCobra: (n) => `Free kicks — when they take them (${n})`,
  penalesCobra: (n) => `Penalties — when they take them (${n})`,
  notaAnalistaCobra: "Analyst's note — when they take them",
  cuandoDefiende: 'When they defend them',
  sinCobrosDefendidos: 'No set pieces defended by the opposition logged yet.',
  jugadoresClaveRival: 'Key opposition players',
  jugadoresClaveRivalCont: 'Key opposition players (continued)',
  jugadorClave: 'Key player',
  sinMotivo: 'No reason given.',
  dafoRival: (rival) => `Opposition SWOT — ${rival}`,
  dafoRivalCont: (rival) => `Opposition SWOT — ${rival} (continued)`,
  dafoFortalezas: 'STRENGTHS', dafoDebilidades: 'WEAKNESSES', dafoOportunidades: 'OPPORTUNITIES', dafoAmenazas: 'THREATS',
  dafoDe: (rival) => rival,
  paraNosotros: 'for us',
  dafoGenerado: (fecha, momentos, partidos) =>
    `Generated with AI in Opposition Analysis${fecha ? ` on ${fecha}` : ''} · from ${momentos} opposition ${pl(momentos, 'moment', 'moments')} and ${partidos} ${pl(partidos, 'match', 'matches')} against them.`,
  planPartido: (rival) => `Game plan against ${rival}`,
  planPartidoCont: (rival) => `Game plan against ${rival} (continued)`,
  planAdaptaciones: (equipo) => `Tactical adjustments (recommendations for ${equipo})`,
  planAbpOfensivo: 'Attacking set pieces (how to make the most of ours)',
  planAbpDefensivo: 'Defensive set pieces (how to defend theirs)',
  trabajoSemana: "Next opponent · this week's work",
  quePreparar: (rival) => `How to prepare for ${rival}`,
  temasNota: 'These are not ready-made drills — they are objectives drawn from the opposition data; you choose the drill.',
  alineacionTitulo: (rival) => `Suggested line-up against ${rival}`,
  sistema: (f) => `Formation 1-${f}`,
  porQue: 'WHY',
  sinMotivos: 'No notes by position.',
  quieresProfundizar: 'Want to go deeper?',
  cierreTexto: 'This summary is an extract. The full analysis — video of every play, historical comparison and AI performance report — is always available on the platform.',
  cierreLinks: ['app.golanalytics.com → Rendimiento (Performance)', 'app.golanalytics.com → Análisis Táctico (Tactical Analysis)', 'app.golanalytics.com → Análisis del Rival (Opposition Analysis)'],
  whatsapp: 'Any questions, message me on WhatsApp',
};

/** Textos del PowerPoint en el idioma pedido (sin idioma = español). */
export function textosPptx(idioma: Idioma | undefined): TextosPptx {
  return idioma === 'en' ? EN : ES;
}
