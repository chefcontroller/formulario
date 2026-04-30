// cc_turnos.js — ChefController
// Selector de turnos del día, crear turno, abrir turno
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_movimientos.js

// ── Estado global de turno activo ────────────────────────
window.curTurno = null;
window.movs     = [];

// ── Cargar selector de turnos del día ───────────────────
async function loadTurnos() {
  const hoy = fechaHoy();
  const h = new Date().getHours();
  const greet = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('tGreeting').textContent = greet;

  const rb = `<span class="role-badge rb-${window.userRol}">${window.userRol}</span>`;
  document.getElementById('tFecha').innerHTML =
    new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' }) + ' · ' + rb;

  const { data: turnos } = await sb.from('turnos')
    .select('*')
    .eq('local_id', window.localId)
    .eq('fecha', hoy)
    .order('numero_turno');

  const grid = document.getElementById('turnoGrid');
  grid.innerHTML = '';

  const nombres = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
  const tclass  = { 1: 'ti1', 2: 'ti2' };
  const iconos  = { 1: SVG_SOL, 2: SVG_LUNA };

  if (turnos?.length) {
    turnos.forEach(t => {
      const closed = t.estado === 'cerrado';
      const card = document.createElement('div');
      card.className = 'tcard' + (closed ? ' closed' : '');
      const hint = closed && isSup()
        ? '<span style="font-size:10px;color:var(--t3);margin-left:4px">ver resumen</span>'
        : '';
      card.innerHTML = `
        <div class="ti ${tclass[t.numero_turno]}">${iconos[t.numero_turno]}</div>
        <div class="tinfo">
          <div class="tname">${nombres[t.numero_turno]}${hint}</div>
          <div class="tmeta">Saldo inicial: ${fmt(t.saldo_inicial)}</div>
        </div>
        <span class="tbadge ${closed ? 'tb-closed' : 'tb-open'}">${closed ? 'Cerrado' : 'Abierto'}</span>`;
      if (!closed) card.onclick = () => openTurno(t);
      else         card.onclick = () => verResumenTurnoDia(t);
      grid.appendChild(card);
    });
  } else {
    grid.innerHTML = '<div style="text-align:center;color:var(--t3);font-size:13px;padding:20px 0">No hay turnos hoy</div>';
  }
}

// ── Crear nuevo turno del día ────────────────────────────
async function crearTurno() {
  const hoy = fechaHoy();
  const { data: ex } = await sb.from('turnos')
    .select('numero_turno')
    .eq('local_id', window.localId)
    .eq('fecha', hoy);

  const nums = ex?.map(t => t.numero_turno) || [];
  const sig  = nums.includes(1) ? 2 : 1;

  if (nums.includes(1) && nums.includes(2)) {
    const grid = document.getElementById('turnoGrid');
    const msg  = document.createElement('div');
    msg.style.cssText = 'background:var(--pb);border-radius:var(--rs);padding:10px 14px;font-size:13px;color:var(--pd);text-align:center;margin-bottom:8px';
    msg.textContent = 'Ambos turnos del día ya están registrados. Podés ver el resumen tocando cualquiera.';
    grid.prepend(msg);
    setTimeout(() => msg.remove(), 3500);
    return;
  }

  const saldo = prompt('Saldo inicial ($):');
  if (saldo === null) return;

  const { data: t } = await sb.from('turnos').insert({
    local_id:     window.localId,
    fecha:        hoy,
    numero_turno: sig,
    saldo_inicial: parseFloat(saldo) || 0,
    estado:       'abierto'
  }).select().single();

  if (t) { await loadTurnos(); openTurno(t); }
}

// ── Abrir turno → ir al dashboard de movimientos ────────
async function openTurno(t) {
  window.curTurno = t;
  window.movs = [];

  const { data: m } = await sb.from('movimientos')
    .select('*')
    .eq('turno_id', t.id)
    .order('created_at');
  if (m) window.movs = m;

  const nombres  = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
  const hoy      = new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long' });
  const cerrado  = t.estado === 'cerrado';

  document.getElementById('tBanner').innerHTML = `
    <div class="banner-top">
      <div class="banner-name">${nombres[t.numero_turno]}</div>
      <span class="banner-status" style="${cerrado ? 'background:rgba(255,255,255,.15)' : ''}">
        ${cerrado ? 'Cerrado' : 'Abierto'}
      </span>
    </div>
    <div class="banner-sub">${hoy} · Saldo inicial ${fmt(t.saldo_inicial)}</div>`;

  document.getElementById('btnCerrarDash').style.display = cerrado ? 'none' : 'block';
  document.getElementById('btnAlivio').style.display     = cerrado ? 'none' : 'block';

  renderMovs();
  show('sDash');
}

// ── Volver al dashboard desde pantalla de éxito ─────────
async function volverAMovimientos() {
  const { data: m } = await sb.from('movimientos')
    .select('*')
    .eq('turno_id', window.curTurno.id)
    .neq('tipo', 'venta')
    .order('created_at');
  window.movs = m || [];

  const nombres   = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
  const fechaDisp = new Date(window.curTurno.fecha + 'T12:00:00')
    .toLocaleDateString('es-AR', { day:'numeric', month:'long' });

  document.getElementById('tBanner').innerHTML = `
    <div class="banner-top">
      <div class="banner-name">${nombres[window.curTurno.numero_turno]}</div>
      <span class="banner-status" style="background:rgba(255,255,255,.15)">Cerrado</span>
    </div>
    <div class="banner-sub">${fechaDisp} · Saldo inicial ${fmt(window.curTurno.saldo_inicial)}</div>`;

  document.getElementById('btnCerrarDash').style.display = 'none';
  document.getElementById('btnAlivio').style.display     = 'none';
  renderMovs();
  show('sDash');
}

// ── Resumen turno cerrado (modal del selector del día) ───
let curTurnoCerrado = null;

async function verResumenTurnoDia(t) {
  curTurnoCerrado = t;
  const nombres = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };

  const ic = document.getElementById('mtcIcon');
  ic.innerHTML  = t.numero_turno === 1 ? SVG_SOL : SVG_LUNA;
  ic.className  = 'ti ' + (t.numero_turno === 1 ? 'ti1' : 'ti2');
  document.getElementById('mtcTitle').textContent = nombres[t.numero_turno];
  document.getElementById('mtcFecha').textContent = new Date(t.fecha + 'T12:00:00')
    .toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });

  const { data: c }  = await sb.from('cierres_turno').select('*').eq('turno_id', t.id).single();
  const { data: ms } = await sb.from('movimientos').select('*').eq('turno_id', t.id).neq('tipo','venta').order('created_at');

  const box = document.getElementById('mtcBox');
  if (c) {
    const diff = c.efectivo_real - c.efectivo_esperado;
    const ok   = Math.abs(diff) < 50;
    box.innerHTML = `
      <div class="ar"><span class="al">Venta total</span><span class="av" style="color:var(--p);font-weight:700">${fmt(c.venta_total||0)}</span></div>
      <div class="ar"><span class="al">Cubiertos</span><span class="av">${c.cubiertos||'—'}</span></div>
      ${c.cubiertos > 0 ? `<div class="ar"><span class="al">Ticket promedio</span><span class="av">${fmt((c.venta_total||0)/(c.cubiertos||1))}</span></div>` : ''}
      <div class="adiv"></div>
      <div class="ar"><span class="al">Efectivo esperado</span><span class="av">${fmt(c.efectivo_esperado||0)}</span></div>
      <div class="ar"><span class="al">Efectivo real</span><span class="av">${fmt(c.efectivo_real||0)}</span></div>
      <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${ok?'var(--ok)':'var(--err)'}">${diff>=0?'+':''}${fmt(diff)}</span></div>
      ${c.observaciones ? `<div class="adiv"></div><div style="font-size:12px;color:var(--t2)"><b>Obs:</b> ${c.observaciones}</div>` : ''}`;
  } else {
    box.innerHTML = '<div style="font-size:13px;color:var(--t3);text-align:center">Sin datos de cierre</div>';
  }

  const movsEl = document.getElementById('mtcMovs');
  movsEl.innerHTML = '';
  if (ms?.length) {
    movsEl.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Movimientos (${ms.length})</div>`;
    ms.forEach(m => {
      const d = document.createElement('div');
      d.className = 'mov-item';
      d.style.cssText = 'cursor:pointer;margin-bottom:5px';
      d.innerHTML = `<span class="mb mb-${m.tipo}">${m.tipo.replace(/_/g,' ')}</span><span class="mc">${m.concepto}</span><span class="mm">${fmt(m.monto)}</span>`;
      d.onclick = () => verDetalleMov(m);
      movsEl.appendChild(d);
    });
  }

  document.getElementById('mtcDelWrap').classList.toggle('hidden', !isSup());
  document.getElementById('modalTurnoCerrado').classList.add('open');
}

function closeMTC() {
  document.getElementById('modalTurnoCerrado').classList.remove('open');
  curTurnoCerrado = null;
}

async function confirmarBorrarTurno() {
  if (!curTurnoCerrado) return;
  if (!confirm(`¿Borrar Turno ${curTurnoCerrado.numero_turno} del ${curTurnoCerrado.fecha}? Esta acción no se puede deshacer.`)) return;
  await sb.from('movimientos').delete().eq('turno_id', curTurnoCerrado.id);
  await sb.from('cierres_turno').delete().eq('turno_id', curTurnoCerrado.id);
  await sb.from('turnos').delete().eq('id', curTurnoCerrado.id);
  closeMTC();
  await loadTurnos();
}
