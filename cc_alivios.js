// cc_alivios.js — ChefController
// Alivios de caja: generar número de sobre, modal, confirmación
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_movimientos.js

// ── Abrir / cerrar modal de alivio ───────────────────────
function openModalAlivio() {
  document.getElementById('alivioMonto').value = '';
  document.getElementById('alivioObs').value   = '';
  document.getElementById('modalAlivio').classList.add('open');
  setTimeout(() => document.getElementById('alivioMonto').focus(), 200);
}
function closeModalAlivio() {
  document.getElementById('modalAlivio').classList.remove('open');
}

// ── Generar número de sobre único (SOB-YYYYMMDD-NNN) ────
function generarNumSobre() {
  const d     = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const aliviosHoy = window.movs.filter(m => m.tipo === 'alivio').length + 1;
  return `SOB-${fecha}-${String(aliviosHoy).padStart(3,'0')}`;
}

// ── Generar alivio → guardar en Supabase ─────────────────
async function generarAlivio() {
  const monto = parseFloat(document.getElementById('alivioMonto').value) || 0;
  if (monto <= 0) { alert('Ingresá el monto del alivio'); return; }

  const obs      = document.getElementById('alivioObs').value.trim();
  const numSobre = generarNumSobre();

  const { data: mov } = await sb.from('movimientos').insert({
    turno_id:      window.curTurno.id,
    tipo:          'alivio',
    concepto:      `Alivio de caja — ${numSobre}`,
    monto,
    medio_pago:    'efectivo',
    referencia:    numSobre,
    observaciones: obs || null
  }).select().single();

  if (mov) {
    window.movs.push(mov);
    renderMovs();
    closeModalAlivio();
    // Mostrar confirmación con número de sobre para anotar en el físico
    document.getElementById('sobreNumero').textContent = numSobre;
    document.getElementById('sobreMonto').textContent  = fmt(monto);
    document.getElementById('modalSobre').classList.add('open');
  }
}

// ── Cerrar confirmación de sobre ─────────────────────────
function closeSobre() {
  document.getElementById('modalSobre').classList.remove('open');
}
