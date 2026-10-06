export function secondsToMmss(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function mmssToSeconds(mmss: string): number {
  if (!mmss) return 0;
  const parts = mmss.split(':').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return 0;

  // Soporta formatos SS, MM:SS y HH:MM:SS
  if (parts.length === 1) {
    return Number(parts[0]) || 0;
  }
  if (parts.length === 2) {
    const minutes = Number(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return Math.floor(minutes * 60 + seconds);
  }
  // parts.length >= 3 -> HH:MM:SS (tomamos las últimas 3 partes)
  const last = parts.slice(-3);
  const hours = Number(last[0]) || 0;
  const minutes = Number(last[1]) || 0;
  const seconds = parseFloat(last[2]) || 0;
  return Math.floor(hours * 3600 + minutes * 60 + seconds);
}
