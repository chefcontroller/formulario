// cc_utils.js — ChefController
// Funciones utilitarias compartidas por todos los módulos

// ── Navegación entre pantallas ───────────────────────────
const show = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

// ── Fecha local del dispositivo (SIEMPRE usar esto, nunca toISOString) ──
// Evita el bug de timezone: después de las 21hs toISOString() devuelve fecha de mañana
const fechaHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ── Formateo de moneda argentina ────────────────────────
const fmt = v => '$' + Math.round(v).toLocaleString('es-AR');

// ── Leer valor numérico de un input por ID ──────────────
const n = id => parseFloat(document.getElementById(id)?.value || 0) || 0;

// ── Verificar si el usuario actual tiene permisos de supervisor ──
// userRol es una variable global definida en cc_auth.js
const isSup = () => ['supervisor', 'dueno', 'admin'].includes(window.userRol || '');

// ── Íconos SVG (evita inconsistencias entre sistemas operativos) ──
const SVG_SOL = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="5" fill="#F59E0B"/>
  <g stroke="#F59E0B" stroke-width="2" stroke-linecap="round">
    <line x1="12" y1="2" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="4" y2="12"/>
    <line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
    <line x1="19.07" y1="4.93" x2="17.66" y2="6.34"/>
    <line x1="6.34" y1="17.66" x2="4.93" y2="19.07"/>
  </g>
</svg>`;

const SVG_LUNA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" fill="#94A3B8"/>
</svg>`;
