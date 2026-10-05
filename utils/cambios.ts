// ─────────────────────────────────────────────────────────────────────────────
// Cambios (sustituciones). Una acción más del Etiquetador, con el mismo
// timestamp automático que cualquier otra jugada — no pide minuto a mano.
//
// El jugador que ENTRA es el `player_id` normal del tag (igual que cualquier
// acción). El jugador que SALE va en `tags.detalle.sale` (uuid del jugador).
// No cuenta en efectividad ni en "Acciones Totales" — ver utils/efectividad.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCION_CAMBIO = 'Cambio';

export interface DetalleCambio {
  sale?: string;
}

export const detalleCambioDe = (tag: { accion: string; detalle?: Record<string, any> | null }): DetalleCambio => {
  if (tag.accion !== ACCION_CAMBIO) return {};
  const d = tag.detalle || {};
  return typeof d.sale === 'string' ? { sale: d.sale } : {};
};

// Resumen corto para la lista de jugadas: "Entra Kevin · Sale Ian"
export const resumenCambio = (entraNombre: string | undefined, saleNombre: string | undefined): string | null => {
  if (!entraNombre && !saleNombre) return null;
  const partes: string[] = [];
  if (entraNombre) partes.push(`Entra ${entraNombre}`);
  if (saleNombre) partes.push(`Sale ${saleNombre}`);
  return partes.join(' · ');
};
