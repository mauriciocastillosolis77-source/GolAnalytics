import type { Tag, Match, Player, TeamAnalysis } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function getApiKey(): string {
    if (typeof window === 'undefined') {
        throw new Error('Gemini client can only be used in browser');
    }
    const env = (import.meta as any).env;
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Check VITE_API_KEY.');
    }
    return apiKey;
}

interface JornadaStats {
    jornada: number;
    total: number;
    logradas: number;
    efectividad: number;
    rival: string;
}

interface LineaStats {
    linea: string;
    total: number;
    logradas: number;
    efectividad: number;
}

interface TopPlayer {
    nombre: string;
    posicion: string;
    acciones: number;
    efectividad: number;
}

function buildTeamPrompt(
    teamName: string,
    jornadaStats: JornadaStats[],
    lineaStats: LineaStats[],
    topPlayers: TopPlayer[],
    totalPartidos: number,
    totalAcciones: number,
    efectividadGlobal: number
): string {
    const jornadasStr = jornadaStats.map(j => 
        `Jornada ${j.jornada} vs ${j.rival}: ${j.total} acciones, ${j.logradas} logradas, ${j.efectividad}% efectividad`
    ).join('\n');

    const lineasStr = lineaStats.map(l => 
        `${l.linea}: ${l.total} acciones, ${l.logradas} logradas, ${l.efectividad}% efectividad`
    ).join('\n');

    const playersStr = topPlayers.map(p => 
        `${p.nombre} (${p.posicion}): ${p.acciones} acciones, ${p.efectividad}% efectividad`
    ).join('\n');

    return `Eres un director tecnico de academia de futbol amateur, especializado en el desarrollo de equipos juveniles. Tu enfoque es constructivo, motivacional y orientado al crecimiento colectivo.

DATOS DEL EQUIPO:
- Nombre: ${teamName}
- Total de partidos analizados: ${totalPartidos}
- Total de acciones registradas: ${totalAcciones}
- Efectividad global del equipo: ${efectividadGlobal}%

RENDIMIENTO POR JORNADA (ordenado cronologicamente):
${jornadasStr || 'Sin datos de jornadas'}

RENDIMIENTO POR LINEA:
${lineasStr || 'Sin datos por linea'}

JUGADORES CON MAS PARTICIPACION:
${playersStr || 'Sin datos de jugadores'}

INSTRUCCIONES:
Analiza estos datos y proporciona un informe ejecutivo del equipo en formato JSON con la siguiente estructura:

1. "tendencia": Indica si el rendimiento del equipo esta "mejorando", "estable" o "bajando" basandote en la progresion de las jornadas.

2. "tendenciaDescripcion": Explica brevemente (2-3 oraciones) por que llegaste a esa conclusion sobre la tendencia. Usa un tono motivacional.

3. "fortalezasColectivas": Lista de 3-4 aspectos en los que el equipo destaca positivamente como unidad.

4. "areasDeMejoraColectivas": Lista de 3-4 oportunidades de desarrollo para el equipo. Formula cada punto como una oportunidad de crecimiento.

5. "analisisPorLinea": Un objeto con analisis de cada linea:
   - "defensa": { "efectividad": numero, "observacion": "texto breve" }
   - "medio": { "efectividad": numero, "observacion": "texto breve" }
   - "ataque": { "efectividad": numero, "observacion": "texto breve" }

6. "jugadoresDestacados": Lista de 2-4 jugadores que sobresalen, cada uno con:
   - "nombre": nombre del jugador
   - "razon": breve explicacion de por que destaca

7. "resumenEjecutivo": Un parrafo de 4-6 oraciones resumiendo el estado actual del equipo y su potencial.

8. "recomendacionesEntrenamiento": Lista de 3-5 ejercicios o enfoques de entrenamiento especificos para mejorar las areas identificadas.

IMPORTANTE - TONO FORMATIVO:
- Usa lenguaje constructivo y orientado al crecimiento colectivo
- EVITA palabras negativas como: "nula", "pobre", "deficiente", "incapaz"
- USA alternativas positivas como: "en desarrollo", "con oportunidad de mejora", "en proceso de consolidacion"
- Recuerda que son equipos en formacion, no profesionales
- Si no hay suficientes datos para una conclusion solida, indicalo
- Responde SOLO con el JSON, sin texto adicional`;
}

function categorizePosition(posicion: string): 'defensa' | 'medio' | 'ataque' | 'portero' {
    const pos = posicion.toLowerCase();
    if (pos.includes('portero') || pos.includes('arquero')) return 'portero';
    if (pos.includes('defensa') || pos.includes('lateral') || pos.includes('central')) return 'defensa';
    if (pos.includes('delantero') || pos.includes('extremo') || pos.includes('punta')) return 'ataque';
    return 'medio';
}

export const analyzeTeamPerformance = async (
    teamName: string,
    matches: Match[],
    tags: Tag[],
    players: Player[]
): Promise<TeamAnalysis> => {
    const apiKey = getApiKey();
    
    const jornadaStats: JornadaStats[] = [];
    const jornadaMap = new Map<number, { total: number; logradas: number; rival: string }>();
    
    tags.forEach(tag => {
        const match = matches.find(m => m.id === tag.match_id);
        if (!match || !match.jornada) return;
        
        if (!jornadaMap.has(match.jornada)) {
            jornadaMap.set(match.jornada, { total: 0, logradas: 0, rival: match.rival });
        }
        const stats = jornadaMap.get(match.jornada)!;
        stats.total++;
        if (tag.resultado === 'logrado') stats.logradas++;
    });
    
    jornadaMap.forEach((stats, jornada) => {
        jornadaStats.push({
            jornada,
            total: stats.total,
            logradas: stats.logradas,
            efectividad: stats.total > 0 ? Math.round((stats.logradas / stats.total) * 100) : 0,
            rival: stats.rival
        });
    });
    jornadaStats.sort((a, b) => a.jornada - b.jornada);

    const lineaMap = new Map<string, { total: number; logradas: number }>();
    ['defensa', 'medio', 'ataque'].forEach(l => lineaMap.set(l, { total: 0, logradas: 0 }));
    
    tags.forEach(tag => {
        const player = players.find(p => p.id === tag.player_id);
        if (!player) return;
        
        const linea = categorizePosition(player.posicion || 'medio');
        if (linea === 'portero') return;
        
        const stats = lineaMap.get(linea)!;
        stats.total++;
        if (tag.resultado === 'logrado') stats.logradas++;
    });
    
    const lineaStats: LineaStats[] = [];
    lineaMap.forEach((stats, linea) => {
        lineaStats.push({
            linea: linea.charAt(0).toUpperCase() + linea.slice(1),
            total: stats.total,
            logradas: stats.logradas,
            efectividad: stats.total > 0 ? Math.round((stats.logradas / stats.total) * 100) : 0
        });
    });

    const playerStats = new Map<string, { total: number; logradas: number }>();
    tags.forEach(tag => {
        if (!playerStats.has(tag.player_id)) {
            playerStats.set(tag.player_id, { total: 0, logradas: 0 });
        }
        const stats = playerStats.get(tag.player_id)!;
        stats.total++;
        if (tag.resultado === 'logrado') stats.logradas++;
    });
    
    const topPlayers: TopPlayer[] = [];
    playerStats.forEach((stats, playerId) => {
        const player = players.find(p => p.id === playerId);
        if (!player) return;
        topPlayers.push({
            nombre: player.nombre,
            posicion: player.posicion || 'No especificada',
            acciones: stats.total,
            efectividad: stats.total > 0 ? Math.round((stats.logradas / stats.total) * 100) : 0
        });
    });
    topPlayers.sort((a, b) => b.acciones - a.acciones);
    const top10Players = topPlayers.slice(0, 10);

    const totalAcciones = tags.length;
    const totalLogradas = tags.filter(t => t.resultado === 'logrado').length;
    const efectividadGlobal = totalAcciones > 0 ? Math.round((totalLogradas / totalAcciones) * 100) : 0;
    
    const prompt = buildTeamPrompt(
        teamName,
        jornadaStats,
        lineaStats,
        top10Players,
        matches.length,
        totalAcciones,
        efectividadGlobal
    );

    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const analysis: TeamAnalysis = JSON.parse(text.trim());
    return analysis;
};

