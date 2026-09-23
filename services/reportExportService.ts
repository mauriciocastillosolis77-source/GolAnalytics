import pptxgen from 'pptxgenjs';
import { supabase } from './supabaseClient';
import { analyzeTeamPerformance } from './geminiTeamAnalysisService';
import { LOGO_BASE64 } from '../constants/logoBase64';
import type { Match, Tag, Player, RivalAnalysis, RivalTipo, RivalZona } from '../types';

// ── Marca GolAnalytics ──────────────────────────────────────────────────
const COLOR = {
  navy: '0A0B14',
  indigo: '5B4FE6',
  indigoDark: '372A82',
  indigoLight: 'EEECFC',
  lavender: '9AA0D9',
  green: '34D399',
  greenLight: 'E1F9EF',
  blue: '60A5FA',
  blueLight: 'E5F0FE',
  orange: 'FF7A59',
  orangeLight: 'FFEAE4',
  gold: 'FFCE54',
  red: 'E15554',
  redLight: 'FCE4E3',
  ink: '1B1B1B',
  gray: '5C6670',
  white: 'FFFFFF',
};

const FONT_HEAD = 'Cambria';
const FONT_BODY = 'Calibri';

function stripMd(text: string): string {
  if (!text) return text;
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
}

// ── Mismas reglas de efectividad que pages/DashboardPage.tsx ────────────
const ACCIONES_EXCLUIDAS_EFECTIVIDAD_GLOBAL = new Set<string>(['Tiros a portería']);
const ACCIONES_SIEMPRE_LOGRADA = new Set<string>([
  'Atajadas', 'Goles a favor', 'Recuperación de balón', 'Transición ofensiva lograda',
]);
const ACCIONES_SIEMPRE_FALLADA = new Set<string>([
  'Goles recibidos', 'Transición ofensiva no lograda', 'Pérdida de balón',
]);
const isElegible = (tag: Tag): boolean => !ACCIONES_EXCLUIDAS_EFECTIVIDAD_GLOBAL.has(tag.accion);
const isLograda = (tag: Tag): boolean => {
  if (ACCIONES_SIEMPRE_LOGRADA.has(tag.accion)) return true;
  if (ACCIONES_SIEMPRE_FALLADA.has(tag.accion)) return false;
  return tag.resultado === 'logrado';
};
function calcularEfectividad(tags: Tag[]): number {
  const elegibles = tags.filter(isElegible);
  if (elegibles.length === 0) return 0;
  const logradas = elegibles.filter(isLograda).length;
  return Math.round((logradas / elegibles.length) * 100);
}

function sectionHeader(slide: pptxgen.Slide, kicker: string, title: string) {
  slide.addText(kicker.toUpperCase(), {
    x: 0.6, y: 0.42, w: 9.5, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11.5, bold: true, color: COLOR.indigo, charSpacing: 2, isTextBox: true, margin: 0,
  });
  slide.addText(title, {
    x: 0.6, y: 0.7, w: 10.8, h: 0.55,
    fontFace: FONT_HEAD, fontSize: 25, bold: true, color: COLOR.ink, isTextBox: true, margin: 0,
  });
}

// Pie de página en TODOS los slides: escudo del equipo (abajo-izquierda) y
// logo de GolAnalytics (abajo-derecha). No existe todavía un campo de logo
// por equipo en la tabla `teams` (solo `id`, `nombre`), así que del lado del
// equipo se usa un círculo con sus iniciales — en cuanto haya un campo real
// de logo por equipo, aquí se cambia por la imagen real.
function footer(pres: pptxgen, slide: pptxgen.Slide, teamName: string, dark: boolean, pageLabel: string) {
  const barY = 7.0;
  const textColor = dark ? COLOR.lavender : COLOR.gray;
  const initials = teamName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  slide.addShape(pres.ShapeType.ellipse, { x: 0.6, y: barY, w: 0.36, h: 0.36, fill: { color: dark ? COLOR.indigo : COLOR.indigoLight }, line: { color: COLOR.indigo, width: 1 } });
  slide.addText(initials, { x: 0.6, y: barY, w: 0.36, h: 0.36, fontFace: FONT_BODY, fontSize: 6.5, bold: true, color: dark ? COLOR.white : COLOR.indigo, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  slide.addText(teamName, { x: 1.05, y: barY, w: 2.2, h: 0.36, fontFace: FONT_BODY, fontSize: 9, color: textColor, valign: 'middle', isTextBox: true, margin: 0 });
  slide.addText(pageLabel, { x: 6.16, y: barY, w: 1, h: 0.36, fontFace: FONT_BODY, fontSize: 9, color: textColor, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  slide.addImage({ data: LOGO_BASE64, x: 12.38, y: barY - 0.06, w: 0.4, h: 0.47 });
}

// ── Análisis del Rival: misma lógica de redacción que pages/AnalisisRivalPage.tsx (summarizeZone) ──
const ATTR2_PHRASE: Record<string, (label: string) => string> = {
  'Carril': (l) => `por la ${l.toLowerCase()}`,
  'Número de hombres': (l) => `con ${l.toLowerCase()} hombres`,
};
const ALTURA_PRESION_LABEL: Record<string, string> = { Alta: 'bloque alto', Media: 'bloque medio', Baja: 'bloque bajo' };
const ATTR_CONFIG: Record<RivalTipo, { lbl2: string }> = {
  Ofensiva: { lbl2: 'Carril' },
  Defensiva: { lbl2: 'Número de hombres' },
  Transicion: { lbl2: 'Carril' },
};
const ZONAS: RivalZona[] = ['Inicio', 'Creacion', 'Finalizacion'];
const ZONA_LABEL: Record<RivalZona, string> = { Inicio: 'Inicio', Creacion: 'Creación', Finalizacion: 'Finalización' };

function summarizeZone(rival: RivalAnalysis, tipo: RivalTipo, zona: RivalZona): string {
  const momentos = (rival.momentos || []).filter((m) => m.tipo === tipo && m.zona === zona);
  if (momentos.length === 0) return 'Sin momentos registrados todavía.';
  const attr1Counts: Record<string, number> = {};
  const attr2Counts: Record<string, number> = {};
  let attr2Total = 0;
  momentos.forEach((m) => {
    attr1Counts[m.attr1] = (attr1Counts[m.attr1] || 0) + 1;
    if (m.attr2) { attr2Counts[m.attr2] = (attr2Counts[m.attr2] || 0) + 1; attr2Total++; }
  });
  const attr1Stats = Object.entries(attr1Counts).map(([label, n]) => ({ label, pct: Math.round((100 * n) / momentos.length) }));
  let text: string;
  if (tipo === 'Defensiva') {
    const parts = attr1Stats.map((s) => `${s.pct}% ${ALTURA_PRESION_LABEL[s.label] || s.label.toLowerCase()}`).join(', ');
    text = `Presión en ${parts}`;
    if (attr1Stats.some((s) => s.label === 'Baja')) text += ', replegados cerca de su área';
  } else {
    text = attr1Stats.map((s) => `${s.pct}% ${s.label.toLowerCase()}`).join(', ');
  }
  if (attr2Total > 0) {
    const top = Object.entries(attr2Counts).map(([label, n]) => ({ label, pct: Math.round((100 * n) / attr2Total) })).sort((a, b) => b.pct - a.pct)[0];
    const phrase = ATTR2_PHRASE[ATTR_CONFIG[tipo].lbl2];
    if (phrase) text += `, mayoritariamente ${phrase(top.label)}`;
  }
  return `${text}.`;
}

function phaseSection(slide: pptxgen.Slide, pres: pptxgen, x: number, y: number, w: number, title: string, rows: Array<{ label: string; text: string }>) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.4, rectRadius: 0.06, fill: { color: COLOR.indigoDark }, line: { type: 'none' } });
  slide.addText(title.toUpperCase(), { x: x + 0.2, y, w: w - 0.4, h: 0.4, fontFace: FONT_BODY, fontSize: 11.5, bold: true, color: COLOR.white, valign: 'middle', charSpacing: 1, isTextBox: true, margin: 0 });
  const rowY = y + 0.52, rowH = 0.42;
  rows.forEach((r, i) => {
    const ry = rowY + i * rowH;
    slide.addText([
      { text: r.label + ':  ', options: { bold: true, color: COLOR.ink } },
      { text: r.text, options: { color: COLOR.ink } },
    ] as any, { x, y: ry, w, h: rowH, fontFace: FONT_BODY, fontSize: 10.5, valign: 'top', isTextBox: true, margin: 0 });
  });
  return rowY + rows.length * rowH;
}

// ── Estilo de juego propio: directo / combinativo / mixto, carril, bloque de presión ──
// Calculado SOLO con datos reales de los tags de este partido (ver detalle de
// cada fórmula en los comentarios). No parte en fases Inicio/Creación/
// Finalización porque los tags de tags no llevan ese dato todavía.
function calcularEstiloDeJuego(tags: Tag[], players: Player[], positionsMap?: Map<string, string>) {
  const cortos = tags.filter((t) => t.accion === 'Pase corto ofensivo' || t.accion === 'Pase corto defensivo').length;
  const largos = tags.filter((t) => t.accion === 'Pase largo ofensivo' || t.accion === 'Pase largo defensivo').length;
  const totalPases = cortos + largos;
  let estilo = 'Sin pases suficientes registrados';
  if (totalPases > 0) {
    const pctCombinativo = Math.round((cortos / totalPases) * 100);
    const pctDirecto = 100 - pctCombinativo;
    if (Math.abs(pctCombinativo - pctDirecto) <= 15) {
      estilo = `Mixto (${pctCombinativo}% combinativo / ${pctDirecto}% directo)`;
    } else if (pctCombinativo > pctDirecto) {
      estilo = `Combinativo (${pctCombinativo}% pases cortos)`;
    } else {
      estilo = `Directo (${pctDirecto}% pases largos)`;
    }
  }

  // Carril — requiere el Excel con posiciones detalladas (Lateral Izquierdo /
  // Lateral Derecho / Extremo Derecho, etc.); sin eso, `players.posicion` solo
  // trae Defensa/Medio/Delantero/Portero y no dice de qué lado.
  let carril = 'No disponible — sube el Excel con posiciones detalladas (lateral izquierdo/derecho) para calcularlo.';
  if (positionsMap) {
    const izq = { count: 0 };
    const der = { count: 0 };
    tags.forEach((t) => {
      if (t.accion !== 'Pase corto ofensivo' && t.accion !== 'Pase corto defensivo' && t.accion !== 'Pase largo ofensivo' && t.accion !== 'Pase largo defensivo') return;
      const player = players.find((p) => p.id === t.player_id);
      if (!player) return;
      const posDetallada = positionsMap.get(player.nombre.trim().toLowerCase());
      if (!posDetallada) return;
      const p = posDetallada.toLowerCase();
      if (p.includes('izquierd')) izq.count++;
      else if (p.includes('derech')) der.count++;
    });
    const totalLateral = izq.count + der.count;
    if (totalLateral > 0) {
      const pctIzq = Math.round((izq.count / totalLateral) * 100);
      carril = izq.count === der.count
        ? `Repartido por igual entre ambos costados (${pctIzq}% izquierda / ${100 - pctIzq}% derecha).`
        : izq.count > der.count
          ? `Predominantemente por la izquierda (${pctIzq}% de los pases de jugadores de banda).`
          : `Predominantemente por la derecha (${100 - pctIzq}% de los pases de jugadores de banda).`;
    } else {
      carril = 'El Excel no trae jugadores con posición lateral (izquierda/derecha) que hayan participado en pases.';
    }
  }

  // Bloque de presión — % de 1 vs 1 defensivo ganados, agrupado por la
  // posición base del jugador (Delantero/Medio/Defensa). Más ganados por
  // delanteros → bloque alto; por medios → bloque medio; por defensas → bajo.
  const duelosGanadosPorGrupo: Record<'Delantero' | 'Medio' | 'Defensa', number> = { Delantero: 0, Medio: 0, Defensa: 0 };
  tags.forEach((t) => {
    if (t.accion !== '1 vs 1 defensivo' || t.resultado !== 'logrado') return;
    const player = players.find((p) => p.id === t.player_id);
    if (!player) return;
    const pos = (player.posicion || '').trim();
    if (pos === 'Delantero' || pos === 'Medio' || pos === 'Defensa') {
      duelosGanadosPorGrupo[pos]++;
    }
  });
  const totalDuelos = duelosGanadosPorGrupo.Delantero + duelosGanadosPorGrupo.Medio + duelosGanadosPorGrupo.Defensa;
  let bloque = 'Sin suficientes 1 vs 1 defensivos ganados con posición registrada.';
  if (totalDuelos > 0) {
    const top = (Object.entries(duelosGanadosPorGrupo) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((top[1] / totalDuelos) * 100);
    const alturaPorGrupo: Record<string, string> = { Delantero: 'alto', Medio: 'medio', Defensa: 'bajo' };
    bloque = `Bloque ${alturaPorGrupo[top[0]]} (${pct}% de los 1 vs 1 defensivos ganados fueron de jugadores de ${top[0].toLowerCase()}).`;
  }

  return { estilo, carril, bloque };
}

/**
 * Arma el reporte de PowerPoint de UN partido específico y dispara la descarga.
 * `positionsMap`: opcional, nombre (lowercase) → posición detallada, sacado de
 * un Excel que el usuario sube en el momento — nunca se persiste en Supabase.
 */
export async function generateMatchReportPptx(
  match: Match,
  authorName?: string,
  positionsMap?: Map<string, string>
): Promise<void> {
  const { data: tagsData, error: tagsError } = await supabase.from('tags').select('*').eq('match_id', match.id);
  if (tagsError) throw tagsError;
  const tags = (tagsData || []) as Tag[];
  if (tags.length === 0) {
    throw new Error('Este partido todavía no tiene acciones etiquetadas — no hay datos para generar el reporte.');
  }

  let players: Player[] = [];
  if (match.team_id) {
    const { data: playersData, error: playersError } = await supabase.from('players').select('*').eq('team_id', match.team_id);
    if (playersError) throw playersError;
    players = (playersData || []) as Player[];
  } else {
    const playerIds = Array.from(new Set(tags.map((t) => t.player_id)));
    if (playerIds.length > 0) {
      const { data: playersData, error: playersError } = await supabase.from('players').select('*').in('id', playerIds);
      if (playersError) throw playersError;
      players = (playersData || []) as Player[];
    }
  }

  const analysis = await analyzeTeamPerformance(match.nombre_equipo, [match], tags, players);

  const efectividadGeneral = calcularEfectividad(tags);
  const goalsFor = tags.filter((t) => t.accion === 'Goles a favor').length;
  const goalsAgainst = tags.filter((t) => t.accion === 'Goles recibidos').length;
  const recuperaciones = tags.filter((t) => t.accion === 'Recuperación de balón').length;
  const tirosAPorteria = tags.filter((t) => t.accion === 'Tiros a portería').length;
  const conversion = tirosAPorteria > 0 ? Math.round((goalsFor / tirosAPorteria) * 100) : 0;
  const transicionesLogradas = tags.filter((t) => t.accion === 'Transición ofensiva lograda').length;

  let promedioTorneo: number | null = null;
  const { data: otherMatches } = await supabase
    .from('matches').select('*')
    .eq('torneo', match.torneo).eq('categoria', match.categoria).eq('nombre_equipo', match.nombre_equipo)
    .neq('id', match.id);
  if (otherMatches && otherMatches.length > 0) {
    const otherIds = otherMatches.map((m: Match) => m.id);
    const { data: otherTagsData } = await supabase.from('tags').select('*').in('match_id', otherIds);
    const otherTags = (otherTagsData || []) as Tag[];
    if (otherTags.length > 0) promedioTorneo = calcularEfectividad(otherTags);
  }

  const destacadosConDatos = analysis.jugadoresDestacados.slice(0, 4).map((jd) => {
    const player = players.find((p) => p.nombre.trim().toLowerCase() === jd.nombre.trim().toLowerCase());
    const playerTags = player ? tags.filter((t) => t.player_id === player.id) : [];
    const acciones = playerTags.length;
    const efectividad = acciones > 0 ? calcularEfectividad(playerTags) : null;
    return { nombre: jd.nombre, razon: stripMd(jd.razon), acciones, efectividad };
  });

  const estiloDeJuego = calcularEstiloDeJuego(tags, players, positionsMap);

  // Análisis del Rival — reutiliza la tabla rival_analysis ya existente (no se
  // crea nada nuevo aquí, solo se conecta con lo que ya cargó el analista en
  // la pantalla "Análisis del Rival"). Si no hay ningún análisis para este
  // rival, esta sección viene null y el slide se omite (no se inventa).
  let rivalAnalysis: RivalAnalysis | null = null;
  {
    // ilike en vez de eq: "Tigres Xochimilco" vs "tigres xochimilco " (mayúsculas,
    // espacios) antes fallaba con comparación exacta y el slide se saltaba sin avisar.
    let query = supabase.from('rival_analysis').select('*').ilike('rival_name', match.rival.trim()).order('created_at', { ascending: false }).limit(1);
    if (match.team_id) query = query.eq('team_id', match.team_id);
    const { data: rivalData } = await query;
    if (rivalData && rivalData.length > 0) rivalAnalysis = rivalData[0] as RivalAnalysis;
  }

  // ── Construcción del .pptx ────────────────────────────────────────────
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  const fechaFmt = new Date(match.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  let slideNum = 0;
  const nextNum = () => (++slideNum).toString();

  // Slide — Portada
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.navy };
    slide.addImage({ data: LOGO_BASE64, x: 0.9, y: 0.5, w: 0.95, h: 1.1 });

    slide.addText('REPORTE DE PARTIDO', { x: 0.9, y: 1.85, w: 9, h: 0.4, fontFace: FONT_BODY, fontSize: 14, bold: true, color: COLOR.gold, charSpacing: 3, isTextBox: true, margin: 0 });
    slide.addText(`${match.nombre_equipo}  vs  ${match.rival}`, { x: 0.9, y: 2.25, w: 11.5, h: 1.0, fontFace: FONT_HEAD, fontSize: 40, bold: true, color: COLOR.white, isTextBox: true, margin: 0 });
    slide.addText(`Jornada ${match.jornada}  ·  ${match.torneo} (${match.categoria})  ·  ${fechaFmt}`, { x: 0.9, y: 3.2, w: 10, h: 0.4, fontFace: FONT_BODY, fontSize: 15, color: COLOR.lavender, isTextBox: true, margin: 0 });

    if (goalsFor > 0 || goalsAgainst > 0) {
      slide.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 3.8, w: 2.2, h: 1.05, rectRadius: 0.1, fill: { color: COLOR.indigo }, line: { type: 'none' } });
      slide.addText(`${goalsFor} — ${goalsAgainst}`, { x: 0.9, y: 3.88, w: 2.2, h: 0.6, fontFace: FONT_HEAD, fontSize: 26, bold: true, color: COLOR.white, align: 'center', isTextBox: true, margin: 0 });
      slide.addText('Marcador (por tags de goles)', { x: 0.9, y: 4.45, w: 2.2, h: 0.3, fontFace: FONT_BODY, fontSize: 8.5, color: COLOR.lavender, align: 'center', isTextBox: true, margin: 0 });
    }
    slide.addText(`Preparado por GolAnalytics${authorName ? `  ·  ${authorName}` : ''}`, { x: 0.9, y: 6.5, w: 10, h: 0.35, fontFace: FONT_BODY, fontSize: 11, italic: true, color: COLOR.lavender, isTextBox: true, margin: 0 });
    footer(pres, slide, match.nombre_equipo, true, nextNum());
  }

  // Slide — Resumen ejecutivo
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Resumen ejecutivo', 'Los highlights del partido');

    if (promedioTorneo !== null) {
      const up = efectividadGeneral >= promedioTorneo;
      slide.addShape(pres.ShapeType.roundRect, { x: 8.55, y: 0.5, w: 4.18, h: 0.62, rectRadius: 0.08, fill: { color: up ? COLOR.greenLight : COLOR.orangeLight }, line: { type: 'none' } });
      slide.addText([
        { text: 'EFECTIVIDAD GENERAL   ', options: { color: COLOR.gray, bold: true, fontSize: 8, charSpacing: 1 } },
        { text: `${up ? '▲' : '▼'} ${efectividadGeneral}%`, options: { color: up ? COLOR.green : COLOR.orange, bold: true, fontSize: 13, breakLine: true } },
        { text: `vs. ${promedioTorneo}% promedio del equipo en el torneo`, options: { color: COLOR.ink, fontSize: 9.5 } },
      ] as any, { x: 8.7, y: 0.5, w: 3.9, h: 0.62, fontFace: FONT_BODY, valign: 'middle', isTextBox: true, margin: 0 });
    }

    const stats = [
      { n: `${efectividadGeneral}%`, l: 'Efectividad general', bg: COLOR.indigoLight, c: COLOR.indigo },
      { n: `${recuperaciones}`, l: 'Recuperaciones de balón', bg: COLOR.blueLight, c: COLOR.blue },
      { n: `${tirosAPorteria} · ${conversion}%`, l: 'Tiros a portería · conversión', bg: COLOR.greenLight, c: COLOR.green },
      { n: `${transicionesLogradas}`, l: 'Transiciones ofensivas logradas', bg: COLOR.orangeLight, c: COLOR.orange },
    ];
    const cardW = 2.75, gap = 0.3, startX = 0.6, y = 1.7;
    stats.forEach((s, i) => {
      const x = startX + i * (cardW + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: cardW, h: 1.75, rectRadius: 0.1, fill: { color: s.bg }, line: { type: 'none' } });
      slide.addText(s.n, { x, y: y + 0.2, w: cardW, h: 0.85, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: s.c, align: 'center', isTextBox: true, margin: 0 });
      slide.addText(s.l, { x: x + 0.15, y: y + 1.1, w: cardW - 0.3, h: 0.55, fontFace: FONT_BODY, fontSize: 11, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
    });

    slide.addText([
      { text: 'Lectura del partido  ', options: { bold: true, fontSize: 15, color: COLOR.ink } },
      { text: '· generado por IA', options: { italic: true, fontSize: 10.5, color: COLOR.gray } },
    ] as any, { x: 0.6, y: 3.75, w: 8, h: 0.35, fontFace: FONT_HEAD, isTextBox: true, margin: 0 });
    slide.addText(stripMd(analysis.resumenEjecutivo), { x: 0.6, y: 4.15, w: 11.8, h: 2.3, fontFace: FONT_BODY, fontSize: 13, color: COLOR.ink, isTextBox: true, margin: 0 });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — Efectividad por línea
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Rendimiento', 'Efectividad por línea');
    const lineas: Array<{ key: 'defensa' | 'medio' | 'ataque'; label: string }> = [
      { key: 'defensa', label: 'DEFENSA' }, { key: 'medio', label: 'MEDIOCAMPO' }, { key: 'ataque', label: 'ATAQUE' },
    ];
    const cardW = 3.75, gap = 0.28, startX = 0.6, y = 1.6;
    lineas.forEach((l, i) => {
      const data = analysis.analisisPorLinea[l.key];
      const x = startX + i * (cardW + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: cardW, h: 3.65, rectRadius: 0.08, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addText(l.label, { x, y: y + 0.25, w: cardW, h: 0.32, fontFace: FONT_BODY, fontSize: 12, bold: true, color: COLOR.gray, align: 'center', charSpacing: 1, isTextBox: true, margin: 0 });
      slide.addText(`${data.efectividad}%`, { x, y: y + 0.6, w: cardW, h: 0.85, fontFace: FONT_HEAD, fontSize: 38, bold: true, color: COLOR.indigo, align: 'center', isTextBox: true, margin: 0 });
      slide.addText(stripMd(data.observacion), { x: x + 0.3, y: y + 1.55, w: cardW - 0.6, h: 1.95, fontFace: FONT_BODY, fontSize: 11.5, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
    });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — Estilo de juego (propio) — directo/combinativo/mixto, carril, bloque de presión
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Rendimiento táctico', 'Cómo jugamos — estilo de este partido');

    const rows = [
      { label: 'Estilo de construcción', value: estiloDeJuego.estilo },
      { label: 'Carril dominante', value: estiloDeJuego.carril },
      { label: 'Bloque de presión', value: estiloDeJuego.bloque },
    ];
    let ry = 1.6;
    rows.forEach((r) => {
      slide.addShape(pres.ShapeType.roundRect, { x: 0.6, y: ry, w: 11.8, h: 1.15, rectRadius: 0.08, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addText(r.label, { x: 0.85, y: ry + 0.12, w: 11.3, h: 0.3, fontFace: FONT_BODY, fontSize: 11, bold: true, color: COLOR.indigo, charSpacing: 0.5, isTextBox: true, margin: 0 });
      slide.addText(r.value, { x: 0.85, y: ry + 0.44, w: 11.3, h: 0.65, fontFace: FONT_BODY, fontSize: 12.5, color: COLOR.ink, isTextBox: true, margin: 0 });
      ry += 1.32;
    });
    slide.addText('No se divide por fase (Inicio/Creación/Finalización) porque el etiquetado actual no registra en qué fase ocurrió cada acción — es un resumen del partido completo.', {
      x: 0.6, y: ry + 0.1, w: 11.8, h: 0.5, fontFace: FONT_BODY, fontSize: 10, italic: true, color: COLOR.gray, isTextBox: true, margin: 0,
    });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — Jugadores destacados
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Rendimiento individual', 'Jugadores destacados');
    const items = destacadosConDatos;
    const cardW = 11.8 / Math.max(items.length, 1) - 0.2;
    items.forEach((p, i) => {
      const x = 0.6 + i * (cardW + 0.25);
      slide.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w: cardW, h: 3.6, rectRadius: 0.1, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addText(p.nombre, { x: x + 0.2, y: 1.95, w: cardW - 0.4, h: 0.4, fontFace: FONT_HEAD, fontSize: 15, bold: true, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
      if (p.acciones > 0) {
        slide.addText(`${p.acciones} acciones${p.efectividad !== null ? ` · ${p.efectividad}% efectividad` : ''}`, { x: x + 0.2, y: 2.35, w: cardW - 0.4, h: 0.35, fontFace: FONT_BODY, fontSize: 10, bold: true, color: COLOR.indigo, align: 'center', isTextBox: true, margin: 0 });
      }
      slide.addText(p.razon, { x: x + 0.2, y: 2.8, w: cardW - 0.4, h: 2.3, fontFace: FONT_BODY, fontSize: 10.5, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
    });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — Análisis del Rival (solo si existe un análisis cargado para este rival)
  if (rivalAnalysis) {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Próximo partido', `Análisis del rival — ${match.rival}`);

    const bottom1 = phaseSection(slide, pres, 0.6, 1.6, 11.8, 'Fase ofensiva · ¿Cómo ataca el rival cuando tiene el balón?',
      ZONAS.map((z) => ({ label: ZONA_LABEL[z], text: summarizeZone(rivalAnalysis!, 'Ofensiva', z) })));
    phaseSection(slide, pres, 0.6, bottom1 + 0.25, 11.8, 'Fase defensiva · ¿Cómo presiona el rival cuando no tiene el balón?',
      ZONAS.map((z) => ({ label: ZONA_LABEL[z], text: summarizeZone(rivalAnalysis!, 'Defensiva', z) })));
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — Recomendaciones de entrenamiento
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'GolAnalytics', 'Recomendaciones de entrenamiento');
    const startY = 1.5, rowH = 0.92, gap = 0.1;
    analysis.recomendacionesEntrenamiento.forEach((text, i) => {
      const y = startY + i * (rowH + gap);
      slide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 11.8, h: rowH, rectRadius: 0.08, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addShape(pres.ShapeType.ellipse, { x: 0.85, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, fill: { color: COLOR.indigo }, line: { type: 'none' } });
      slide.addText(String(i + 1), { x: 0.85, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, fontFace: FONT_HEAD, fontSize: 15, bold: true, color: COLOR.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
      slide.addText(stripMd(text), { x: 1.55, y: y + 0.06, w: 10.65, h: rowH - 0.12, fontFace: FONT_BODY, fontSize: 10.5, color: COLOR.ink, valign: 'middle', isTextBox: true, margin: 0 });
    });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  // Slide — DAFO, 4 cuadrantes.
  // Fortalezas/Debilidades: del análisis IA de este partido (real).
  // Oportunidades/Amenazas: del Análisis del Rival ya cargado — Oportunidades
  // = su fase defensiva más floja (bloque bajo / pocos hombres); Amenazas =
  // su fase ofensiva más peligrosa (mayor % de una zona). Si no hay Análisis
  // del Rival cargado, esos 2 cuadrantes dicen explícitamente que faltan datos
  // — no se inventan.
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, 'Conclusión', 'Análisis DAFO — este partido');

    let oportunidades = ['Sin Análisis del Rival cargado para este equipo — no se pudo calcular.'];
    let amenazas = ['Sin Análisis del Rival cargado para este equipo — no se pudo calcular.'];
    if (rivalAnalysis) {
      oportunidades = ZONAS.map((z) => `Defensiva — ${ZONA_LABEL[z]}: ${summarizeZone(rivalAnalysis!, 'Defensiva', z)}`)
        .filter((t) => !t.includes('Sin momentos'));
      amenazas = ZONAS.map((z) => `Ofensiva — ${ZONA_LABEL[z]}: ${summarizeZone(rivalAnalysis!, 'Ofensiva', z)}`)
        .filter((t) => !t.includes('Sin momentos'));
      if (oportunidades.length === 0) oportunidades = ['El rival no tiene momentos defensivos etiquetados todavía.'];
      if (amenazas.length === 0) amenazas = ['El rival no tiene momentos ofensivos etiquetados todavía.'];
    }

    const quads: Array<{ title: string; items: string[]; fill: string; color: string }> = [
      { title: 'FORTALEZAS', items: analysis.fortalezasColectivas.map(stripMd), fill: COLOR.greenLight, color: COLOR.green },
      { title: 'OPORTUNIDADES', items: oportunidades, fill: COLOR.blueLight, color: COLOR.blue },
      { title: 'DEBILIDADES', items: analysis.areasDeMejoraColectivas.map(stripMd), fill: COLOR.orangeLight, color: COLOR.orange },
      { title: 'AMENAZAS', items: amenazas, fill: COLOR.redLight, color: COLOR.red },
    ];
    const qw = 5.75, qh = 2.3, gapX = 0.3, gapY = 0.2, startX = 0.6, startY = 1.55;
    quads.forEach((q, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = startX + col * (qw + gapX), y = startY + row * (qh + gapY);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: qw, h: qh, rectRadius: 0.08, fill: { color: q.fill }, line: { type: 'none' } });
      slide.addText(q.title, { x: x + 0.3, y: y + 0.16, w: qw - 0.6, h: 0.32, fontFace: FONT_BODY, fontSize: 12, bold: true, color: q.color, charSpacing: 0.5, isTextBox: true, margin: 0 });
      slide.addText(
        q.items.slice(0, 3).map((t, j) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: j < Math.min(q.items.length, 3) - 1, paraSpaceAfter: 6 } })) as any,
        { x: x + 0.3, y: y + 0.54, w: qw - 0.6, h: qh - 0.68, fontFace: FONT_BODY, fontSize: 9.5, color: COLOR.ink, isTextBox: true, margin: 0 }
      );
    });
    footer(pres, slide, match.nombre_equipo, false, nextNum());
  }

  const fileName = `Reporte_${match.nombre_equipo}_J${match.jornada}`.replace(/\s+/g, '_');
  await pres.writeFile({ fileName: `${fileName}.pptx` });
}
