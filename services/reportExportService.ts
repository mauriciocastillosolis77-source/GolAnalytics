import pptxgen from 'pptxgenjs';
import { supabase } from './supabaseClient';
import { analyzeTeamPerformance } from './geminiTeamAnalysisService';
import type { Match, Tag, Player } from '../types';

// ── Marca GolAnalytics (mismos valores usados en el mockup de diseño) ──────
const COLOR = {
  navy: '0A0B14',
  indigo: '5B4FE6',
  indigoDark: '372A82',
  indigoLight: 'EEECFC',
  lavender: '9AA0D9',
  green: '34D399',
  greenLight: 'E1F9EF',
  orange: 'FF7A59',
  orangeLight: 'FFEAE4',
  gold: 'FFCE54',
  ink: '1B1B1B',
  gray: '5C6670',
  white: 'FFFFFF',
};

const FONT_HEAD = 'Cambria';
const FONT_BODY = 'Calibri';

function sectionHeader(slide: pptxgen.Slide, pres: pptxgen, kicker: string, title: string) {
  slide.addText(kicker.toUpperCase(), {
    x: 0.6, y: 0.42, w: 9.5, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11.5, bold: true, color: COLOR.indigo,
    charSpacing: 2, isTextBox: true, margin: 0,
  });
  slide.addText(title, {
    x: 0.6, y: 0.7, w: 10.8, h: 0.55,
    fontFace: FONT_HEAD, fontSize: 25, bold: true, color: COLOR.ink,
    isTextBox: true, margin: 0,
  });
}

function footer(slide: pptxgen.Slide, label: string) {
  slide.addText(label, {
    x: 12.4, y: 7.05, w: 0.6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: COLOR.gray, align: 'right', isTextBox: true, margin: 0,
  });
}

/**
 * Arma el reporte de PowerPoint de UN partido específico y dispara la descarga
 * en el navegador. Reutiliza analyzeTeamPerformance (ya existente en
 * geminiTeamAnalysisService) pasándole un solo partido, para que el análisis
 * de IA (efectividad por línea, jugadores destacados, fortalezas,
 * recomendaciones) se calcule específicamente para este partido y no como
 * promedio de varias jornadas.
 *
 * PENDIENTE (no incluido todavía, para no inventar datos que no existen aún
 * como campos reales en la plataforma):
 *  - Slide de fases tácticas (Inicio / Creación / Finalización): falta la
 *    lógica que calcula directo/combinativo y altura de bloque a partir de
 *    pases por posición y 1 vs 1 defensivo ganado.
 *  - Slide de Análisis del Rival: falta conectar con el momento/nota
 *    guardados en `rival_analysis` para el equipo rival de este partido.
 *  - Marcador del partido: `matches` no tiene columnas de goles a favor/en
 *    contra todavía, así que la portada no muestra un marcador.
 */
export async function generateMatchReportPptx(match: Match): Promise<void> {
  // 1) Tags de este partido puntual.
  const { data: tagsData, error: tagsError } = await supabase
    .from('tags')
    .select('*')
    .eq('match_id', match.id);
  if (tagsError) throw tagsError;
  const tags = (tagsData || []) as Tag[];

  if (tags.length === 0) {
    throw new Error('Este partido todavía no tiene acciones etiquetadas — no hay datos para generar el reporte.');
  }

  // 2) Jugadores del equipo (por team_id si está disponible en el partido).
  let players: Player[] = [];
  if (match.team_id) {
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', match.team_id);
    if (playersError) throw playersError;
    players = (playersData || []) as Player[];
  } else {
    // Sin team_id en el partido: se resuelve por los player_id que aparecen
    // en los tags de este partido.
    const playerIds = Array.from(new Set(tags.map((t) => t.player_id)));
    if (playerIds.length > 0) {
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .in('id', playerIds);
      if (playersError) throw playersError;
      players = (playersData || []) as Player[];
    }
  }

  // 3) Análisis IA para este partido (reutiliza el servicio existente).
  const analysis = await analyzeTeamPerformance(match.nombre_equipo, [match], tags, players);

  const totalAcciones = tags.length;
  const totalLogradas = tags.filter((t) => t.resultado === 'logrado').length;
  const efectividadGeneral = totalAcciones > 0 ? Math.round((totalLogradas / totalAcciones) * 100) : 0;

  // ── Construcción del .pptx ────────────────────────────────────────────
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  const fechaFmt = new Date(match.fecha).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Slide 1 — Portada
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.navy };
    slide.addText('REPORTE DE PARTIDO', {
      x: 0.9, y: 0.7, w: 9, h: 0.4,
      fontFace: FONT_BODY, fontSize: 14, bold: true, color: COLOR.gold, charSpacing: 3, isTextBox: true, margin: 0,
    });
    slide.addText(`${match.nombre_equipo}  vs  ${match.rival}`, {
      x: 0.9, y: 1.15, w: 11.5, h: 1.1,
      fontFace: FONT_HEAD, fontSize: 40, bold: true, color: COLOR.white, isTextBox: true, margin: 0,
    });
    slide.addText(`Jornada ${match.jornada}  ·  ${match.torneo} (${match.categoria})  ·  ${fechaFmt}`, {
      x: 0.9, y: 2.15, w: 10, h: 0.4,
      fontFace: FONT_BODY, fontSize: 15, color: COLOR.lavender, isTextBox: true, margin: 0,
    });
    slide.addText('Preparado por GolAnalytics', {
      x: 0.9, y: 6.6, w: 10, h: 0.35,
      fontFace: FONT_BODY, fontSize: 11, italic: true, color: COLOR.lavender, isTextBox: true, margin: 0,
    });
  }

  // Slide 2 — Resumen ejecutivo
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, pres, 'Resumen ejecutivo', 'Los highlights del partido');

    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y: 1.6, w: 3.2, h: 1.6, rectRadius: 0.1, fill: { color: COLOR.indigoLight }, line: { type: 'none' },
    });
    slide.addText(`${efectividadGeneral}%`, {
      x: 0.6, y: 1.8, w: 3.2, h: 0.85, fontFace: FONT_HEAD, fontSize: 32, bold: true, color: COLOR.indigo, align: 'center', isTextBox: true, margin: 0,
    });
    slide.addText('Efectividad general', {
      x: 0.75, y: 2.65, w: 2.9, h: 0.4, fontFace: FONT_BODY, fontSize: 11.5, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0,
    });

    slide.addText([
      { text: 'Lectura del partido  ', options: { bold: true, fontSize: 15, color: COLOR.ink } },
      { text: '· generado por IA', options: { italic: true, fontSize: 10.5, color: COLOR.gray } },
    ] as any, { x: 0.6, y: 3.6, w: 8, h: 0.35, fontFace: FONT_HEAD, isTextBox: true, margin: 0 });

    slide.addText(analysis.resumenEjecutivo, {
      x: 0.6, y: 4.0, w: 11.8, h: 2.4, fontFace: FONT_BODY, fontSize: 13, color: COLOR.ink, isTextBox: true, margin: 0,
    });
  }

  // Slide 3 — Efectividad por línea
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, pres, 'Rendimiento', 'Efectividad por línea');

    const lineas: Array<{ key: 'defensa' | 'medio' | 'ataque'; label: string }> = [
      { key: 'defensa', label: 'DEFENSA' },
      { key: 'medio', label: 'MEDIOCAMPO' },
      { key: 'ataque', label: 'ATAQUE' },
    ];
    const cardW = 3.75, gap = 0.28, startX = 0.6, y = 1.6;
    lineas.forEach((l, i) => {
      const data = analysis.analisisPorLinea[l.key];
      const x = startX + i * (cardW + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: cardW, h: 3.65, rectRadius: 0.08, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addText(l.label, { x, y: y + 0.25, w: cardW, h: 0.32, fontFace: FONT_BODY, fontSize: 12, bold: true, color: COLOR.gray, align: 'center', charSpacing: 1, isTextBox: true, margin: 0 });
      slide.addText(`${data.efectividad}%`, { x, y: y + 0.6, w: cardW, h: 0.85, fontFace: FONT_HEAD, fontSize: 38, bold: true, color: COLOR.indigo, align: 'center', isTextBox: true, margin: 0 });
      slide.addText(data.observacion, { x: x + 0.3, y: y + 1.55, w: cardW - 0.6, h: 1.95, fontFace: FONT_BODY, fontSize: 11.5, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
    });
  }

  // Slide 4 — Jugadores destacados
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, pres, 'Rendimiento individual', 'Jugadores destacados');

    const items = analysis.jugadoresDestacados.slice(0, 4);
    const cardW = 11.8 / Math.max(items.length, 1) - 0.2;
    items.forEach((p, i) => {
      const x = 0.6 + i * (cardW + 0.25);
      slide.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w: cardW, h: 3.6, rectRadius: 0.1, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addText(p.nombre, { x: x + 0.2, y: 2.0, w: cardW - 0.4, h: 0.45, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
      slide.addText(p.razon, { x: x + 0.2, y: 2.55, w: cardW - 0.4, h: 2.5, fontFace: FONT_BODY, fontSize: 11, color: COLOR.ink, align: 'center', isTextBox: true, margin: 0 });
    });
  }

  // Slide 5 — Recomendaciones de entrenamiento
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, pres, 'GolAnalytics', 'Recomendaciones de entrenamiento');

    const startY = 1.5, rowH = 0.92, gap = 0.1;
    analysis.recomendacionesEntrenamiento.forEach((text, i) => {
      const y = startY + i * (rowH + gap);
      slide.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 11.8, h: rowH, rectRadius: 0.08, fill: { color: COLOR.indigoLight }, line: { type: 'none' } });
      slide.addShape(pres.ShapeType.ellipse, { x: 0.85, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, fill: { color: COLOR.indigo }, line: { type: 'none' } });
      slide.addText(String(i + 1), { x: 0.85, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, fontFace: FONT_HEAD, fontSize: 15, bold: true, color: COLOR.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
      slide.addText(text, { x: 1.55, y: y + 0.06, w: 10.65, h: rowH - 0.12, fontFace: FONT_BODY, fontSize: 10.5, color: COLOR.ink, valign: 'middle', isTextBox: true, margin: 0 });
    });
  }

  // Slide 6 — Fortalezas y áreas de mejora de este partido
  // (DAFO completo con Oportunidades/Amenazas queda pendiente: requiere
  // Análisis del Rival y fases tácticas, que todavía no están conectados aquí.)
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    sectionHeader(slide, pres, 'Conclusión', 'Fortalezas y áreas de mejora — este partido');

    const cols: Array<{ title: string; items: string[]; fill: string; color: string }> = [
      { title: 'FORTALEZAS', items: analysis.fortalezasColectivas, fill: COLOR.greenLight, color: COLOR.green },
      { title: 'ÁREAS DE MEJORA', items: analysis.areasDeMejoraColectivas, fill: COLOR.orangeLight, color: COLOR.orange },
    ];
    const colW = 5.75, gapX = 0.3, startX = 0.6, y = 1.6, h = 4.6;
    cols.forEach((c, i) => {
      const x = startX + i * (colW + gapX);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: colW, h, rectRadius: 0.08, fill: { color: c.fill }, line: { type: 'none' } });
      slide.addText(c.title, { x: x + 0.3, y: y + 0.2, w: colW - 0.6, h: 0.35, fontFace: FONT_BODY, fontSize: 13, bold: true, color: c.color, charSpacing: 0.5, isTextBox: true, margin: 0 });
      slide.addText(
        c.items.map((t, j) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: j < c.items.length - 1, paraSpaceAfter: 8 } })) as any,
        { x: x + 0.3, y: y + 0.65, w: colW - 0.6, h: h - 0.9, fontFace: FONT_BODY, fontSize: 12, color: COLOR.ink, isTextBox: true, margin: 0 }
      );
    });
    footer(slide, '6');
  }

  const fileName = `Reporte_${match.nombre_equipo}_J${match.jornada}`.replace(/\s+/g, '_');
  await pres.writeFile({ fileName: `${fileName}.pptx` });
}
