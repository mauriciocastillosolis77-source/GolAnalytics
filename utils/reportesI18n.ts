// ─────────────────────────────────────────────────────────────────────────────
// Textos fijos de los reportes exportados (PDF), en español y en inglés.
//
// · El español es EXACTAMENTE el que ya tenían los reportes: no se cambió ni
//   una letra (por eso algunas palabras van sin acento, así estaban).
// · El inglés es el del fútbol internacional (football, pitch, match,
//   matchday), escrito como se habla de fútbol, no palabra por palabra.
// · Aquí solo va lo fijo. Lo que escribe la IA o el usuario lo traduce
//   services/traduccionService.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Idioma } from './scoutingI18n';
export type { Idioma } from './scoutingI18n';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const ES = {
  locale: 'es-MX',
  sufijoArchivo: '',
  // Encabezado y pie
  lema: 'Midiendo el Progreso',
  equipoGenerado: (equipo: string, usuario: string) => `Equipo: ${equipo}  ·  Generado por: ${usuario}`,
  jugadorLinea: (nombre: string, numero: string | number) => `Jugador: ${nombre} (#${numero})`,
  posicionLinea: (posicion: string) => `  ·  Posicion: ${posicion}`,
  pie: 'Este documento fue generado desde GolAnalytics con fines informativos y formativos.',
  pagina: (i: number, total: number) => `Pagina ${i} de ${total}`,
  tendencia: (t: string) => t.toUpperCase(),
  // PDF del equipo (Tablero)
  equipoTitulo: 'ANALISIS EJECUTIVO DEL EQUIPO',
  rendimientoPorLinea: 'RENDIMIENTO POR LINEA',
  defensa: 'DEFENSA', medio: 'MEDIOCAMPO', ataque: 'ATAQUE',
  fortalezasColectivas: 'FORTALEZAS COLECTIVAS',
  oportunidadesMejora: 'OPORTUNIDADES DE MEJORA',
  jugadoresDestacados: 'JUGADORES DESTACADOS',
  resumenEjecutivo: 'RESUMEN EJECUTIVO',
  recomendacionesEntrenamiento: 'RECOMENDACIONES DE ENTRENAMIENTO',
  // PDF del jugador (Rendimiento)
  jugadorTitulo: 'ANALISIS DE RENDIMIENTO INDIVIDUAL',
  kpiTotalAcciones: 'Total Acciones', kpiEfectividad: 'Efectividad Global', kpiMejor: 'Mejor Jornada', kpiPeor: 'Peor Jornada',
  kpiJornada: (jornada: number, efectividad: number) => `J${jornada} (${efectividad}%)`,
  fortalezasJugador: 'FORTALEZAS DEL JUGADOR',
  oportunidadesDesarrollo: 'OPORTUNIDADES DE DESARROLLO',
  comparativoProfesional: 'COMPARATIVO PROFESIONAL',
  comparativoNota: 'Cualidades de referencia de un jugador profesional en esta posicion, como guia de desarrollo.',
  posicionDosPuntos: (posicion: string) => `Posicion: ${posicion}`,
  metricasReferencia: 'Metricas de referencia:',
  recomendacionesEntrenador: 'RECOMENDACIONES PARA EL ENTRENADOR',
  // PDF de minutos (Rendimiento)
  minutosTitulo: 'MINUTOS JUGADOS POR JUGADOR',
  minutosColumnas: ['#', 'Jugador', 'PJ', 'Titular', 'Suplente', 'Minutos', '% de minutos', 'Lesión', 'No conv.', 'Falta'],
  periodo: (p: string) => `Periodo: ${p}`,
  partidosConsiderados: (partidos: number, minutos: number) => `Partidos considerados: ${partidos}  ·  Minutos posibles: ${minutos}`,
  partidosSinDatos: (n: number) => `${n} partido${n === 1 ? '' : 's'} del periodo no entra${n === 1 ? '' : 'n'} al cálculo (sin alineación o sin duración de video).`,
  minutosNotas: [
    'PJ: partidos en los que jugó, de inicio o entrando de cambio.  Titular: partidos que inició.  Suplente: partidos en los que entró de cambio.',
    '% de minutos: minutos jugados entre los minutos posibles del periodo (la suma de la duración de los partidos considerados).',
    'Lesión / No conv. / Falta: número de partidos en los que no estuvo disponible por esa razón.',
  ],
  // Texto del periodo (lo arma la página de Rendimiento)
  periodoTorneos: (torneos: string[]) => `${torneos.length} torneos (${torneos.join(', ')})`,
  periodoSinPartidos: 'Sin partidos',
  periodoCategoria: (categoria: string) => `Categoría ${categoria}`,
  periodoJornada: (j: number) => `Jornada ${j}`,
  periodoJornadas: (a: number, b: number) => `Jornadas ${a} a ${b}`,
  // Firma que lleva el PDF de minutos cuando el usuario no tiene nombre capturado
  firmaPorDefecto: 'Mauricio Castillo — Analista Táctico y de Rendimiento',
};

export type TextosReportes = typeof ES;

const TENDENCIA_EN: Record<string, string> = { mejorando: 'IMPROVING', estable: 'STEADY', bajando: 'DECLINING' };

const EN: TextosReportes = {
  locale: 'en-GB',
  sufijoArchivo: '_EN',
  lema: 'Measuring Progress',
  equipoGenerado: (equipo, usuario) => `Team: ${equipo}  ·  Prepared by: ${usuario}`,
  jugadorLinea: (nombre, numero) => `Player: ${nombre} (#${numero})`,
  posicionLinea: (posicion) => `  ·  Position: ${posicion}`,
  pie: 'This document was produced with GolAnalytics for information and player development purposes.',
  pagina: (i, total) => `Page ${i} of ${total}`,
  tendencia: (t) => TENDENCIA_EN[t.toLowerCase()] || t.toUpperCase(),
  equipoTitulo: 'EXECUTIVE TEAM ANALYSIS',
  rendimientoPorLinea: 'PERFORMANCE BY UNIT',
  defensa: 'DEFENCE', medio: 'MIDFIELD', ataque: 'ATTACK',
  fortalezasColectivas: 'TEAM STRENGTHS',
  oportunidadesMejora: 'AREAS TO IMPROVE',
  jugadoresDestacados: 'STANDOUT PLAYERS',
  resumenEjecutivo: 'EXECUTIVE SUMMARY',
  recomendacionesEntrenamiento: 'TRAINING RECOMMENDATIONS',
  jugadorTitulo: 'INDIVIDUAL PERFORMANCE ANALYSIS',
  kpiTotalAcciones: 'Total actions', kpiEfectividad: 'Overall success rate', kpiMejor: 'Best matchday', kpiPeor: 'Worst matchday',
  kpiJornada: (jornada, efectividad) => `MD${jornada} (${efectividad}%)`,
  fortalezasJugador: 'PLAYER STRENGTHS',
  oportunidadesDesarrollo: 'AREAS FOR DEVELOPMENT',
  comparativoProfesional: 'PROFESSIONAL BENCHMARK',
  comparativoNota: 'What a professional player in this position is expected to offer, as a guide for development.',
  posicionDosPuntos: (posicion) => `Position: ${posicion}`,
  metricasReferencia: 'Benchmark metrics:',
  recomendacionesEntrenador: 'RECOMMENDATIONS FOR THE COACH',
  minutosTitulo: 'MINUTES PLAYED PER PLAYER',
  minutosColumnas: ['#', 'Player', 'Apps', 'Starts', 'Sub', 'Minutes', '% of minutes', 'Inj.', 'Not sel.', 'Abs.'],
  periodo: (p) => `Period: ${p}`,
  partidosConsiderados: (partidos, minutos) => `Matches counted: ${partidos}  ·  Minutes available: ${minutos}`,
  partidosSinDatos: (n) => `${n} ${plural(n, 'match', 'matches')} in this period ${plural(n, 'is', 'are')} left out of the calculation (no line-up or no video length).`,
  minutosNotas: [
    'Apps: matches the player featured in, from the start or off the bench.  Starts: matches started.  Sub: matches in which the player came on as a substitute.',
    '% of minutes: minutes played out of the minutes available in the period (the combined length of the matches counted).',
    'Inj. / Not sel. / Abs.: number of matches the player missed through injury, was not selected for, or was absent from.',
  ],
  periodoTorneos: (torneos) => `${torneos.length} competitions (${torneos.join(', ')})`,
  periodoSinPartidos: 'No matches',
  periodoCategoria: (categoria) => `Category ${categoria}`,
  periodoJornada: (j) => `Matchday ${j}`,
  periodoJornadas: (a, b) => `Matchdays ${a} to ${b}`,
  firmaPorDefecto: 'Mauricio Castillo — Tactical and Performance Analyst',
};

/** Textos fijos de los reportes en el idioma pedido (sin idioma = español). */
export function textosReportes(idioma: Idioma | undefined): TextosReportes {
  return idioma === 'en' ? EN : ES;
}
