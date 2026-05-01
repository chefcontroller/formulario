// cc_mes.js — ChefController
// Tabla del mes completa, ABM de arqueos históricos, auditoría de borrados
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_movimientos.js, cc_arqueo.js

// ── Estado de navegación de mes ──────────────────────────
window.mesYear  = new Date().getFullYear();
window.mesMonth = new Date().getMonth();

// ── Estado del turno activo desde la vista mes ───────────
let mesTurnoActual  = null;
let mesCierreActual = null;

// Estado para nuevo turno histórico
let mnthFechaActual      = null;
let mnthTurnoExistenteId = null;
let mnthTurnoExistente   = null;

// ── Cargar tabla del mes ─────────────────────────────────
async function loadMes() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('mesTitulo').textContent = meses[window.mesMonth] + ' ' + window.mesYear;

  const desde = new Date(window.mesYear, window.mesMonth, 1).toISOString().split('T')[0];
  const hasta = new Date(window.mesYear, window.mesMonth + 1, 0).toISOString().split('T')[0];

  // Query 1: turnos + cierres
  const { data: turnos } = await sb.from('turnos')
    .select('*, cierres_turno(*)')
    .eq('local_id', window.localId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('numero_turno');

  // Query 2: compras/egresos del mes en una sola llamada
  // Traemos turno_id, tipo, monto, medio_pago de movimientos del mes
  const turnoIds = turnos?.map(t => t.id) || [];
  let comprasPorTurno = {}; // { turno_id: { total, efectivo, cantidad } }

  if (turnoIds.length > 0) {
    const { data: movs } = await sb.from('movimientos')
      .select('turno_id, tipo, monto, medio_pago')
      .in('turno_id', turnoIds)
      .in('tipo', ['compra', 'egreso']);

    movs?.forEach(m => {
      if (!comprasPorTurno[m.turno_id]) {
        comprasPorTurno[m.turno_id] = { total: 0, efectivo: 0, cantidad: 0 };
      }
      comprasPorTurno[m.turno_id].total    += m.monto || 0;
      comprasPorTurno[m.turno_id].cantidad += 1;
      if (m.medio_pago === 'efectivo') {
        comprasPorTurno[m.turno_id].efectivo += m.monto || 0;
      }
    });
  }

  // Índice por fecha+numero para lookup O(1)
  const idx = {};
  turnos?.forEach(t => { idx[t.fecha + '_' + t.numero_turno] = t; });

  // ── KPIs del mes (solo supervisor+) ─────────────────────
  const kpisEl = document.getElementById('mesKpis');
  if (isSup()) {
    kpisEl.classList.remove('hidden');
    let vtotal = 0, ctotal = 0, comprasTotal = 0, comprasEft = 0, movsTotal = 0;
    turnos?.forEach(t => {
      const c  = t.cierres_turno;
      const cp = comprasPorTurno[t.id] || {};
      if (c) { vtotal += c.venta_total || 0; ctotal += c.cubiertos || 0; }
      comprasTotal += cp.total    || 0;
      comprasEft   += cp.efectivo || 0;
      movsTotal    += cp.cantidad || 0;
    });
    kpisEl.innerHTML = `
      <div class="mes-kpi"><div class="mes-kpi-val">${fmt(vtotal)}</div><div class="mes-kpi-label">Venta total</div></div>
      <div class="mes-kpi"><div class="mes-kpi-val">${ctotal.toLocaleString('es-AR')}</div><div class="mes-kpi-label">Cubiertos</div></div>
      <div class="mes-kpi"><div class="mes-kpi-val">${ctotal > 0 ? fmt(Math.round(vtotal/ctotal)) : '—'}</div><div class="mes-kpi-label">Tkt. prom.</div></div>
      <div class="mes-kpi"><div class="mes-kpi-val" style="color:var(--err)">${fmt(comprasTotal)}</div><div class="mes-kpi-label">Compras mes</div></div>
      <div class="mes-kpi"><div class="mes-kpi-val" style="color:var(--err)">${fmt(comprasEft)}</div><div class="mes-kpi-label">Compras efect.</div></div>
      <div class="mes-kpi"><div class="mes-kpi-val">${movsTotal}</div><div class="mes-kpi-label">Movimientos</div></div>`;
  } else {
    kpisEl.classList.add('hidden');
  }

  // ── Tabla: generar TODOS los días del mes ────────────────
  const tbody     = document.getElementById('mesTbody');
  tbody.innerHTML = '';
  const diasEnMes = new Date(window.mesYear, window.mesMonth + 1, 0).getDate();
  const hoy       = fechaHoy();

  const iconSolSm  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#F59E0B"/><g stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="17.66" y2="6.34"/><line x1="6.34" y1="17.66" x2="4.93" y2="19.07"/></g></svg>`;
  const iconLunaSm = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" fill="#94A3B8"/></svg>`;

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha     = `${window.mesYear}-${String(window.mesMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const esFuturo  = fecha > hoy;
    const fechaObj  = new Date(fecha + 'T12:00:00');
    const dia       = fechaObj.toLocaleDateString('es-AR', { day:'numeric' });
    const mesStr    = fechaObj.toLocaleDateString('es-AR', { month:'short' }).replace('.','');
    const dow       = fechaObj.toLocaleDateString('es-AR', { weekday:'short' }).replace('.','');
    const fechaCell = `
      <div style="line-height:1.2">
        <div style="font-size:13px;font-weight:700;color:var(--t)">${dia} ${mesStr}</div>
        <div style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.3px">${dow}</div>
      </div>`;

    for (let nt = 1; nt <= 2; nt++) {
      const t   = idx[fecha + '_' + nt] || null;
      const c   = t?.cierres_turno || null;
      const cp  = t ? (comprasPorTurno[t.id] || null) : null;

      const venta = c?.venta_total      || 0;
      const cub   = c?.cubiertos        || 0;
      const ef    = c?.efectivo_real     || 0;
      const efEsp = c?.efectivo_esperado || 0;
      const diff  = ef - efEsp;
      const ok    = Math.abs(diff) < 50;

      // Celda de compras — segunda línea debajo de venta
      let comprasCell = '—';
      if (!esFuturo && t && cp && cp.total > 0) {
        comprasCell = `
          <div style="font-size:12px;font-weight:500;color:var(--err)">${fmt(cp.total)}</div>
          <div style="font-size:10px;color:var(--t3)">${fmt(cp.efectivo)} ef · ${cp.cantidad} mov</div>`;
      } else if (!esFuturo && t) {
        comprasCell = '<span style="color:var(--t3);font-size:12px">—</span>';
      }

      // Celda de arqueo
      let arqCell;
      if (esFuturo) {
        arqCell = '';
      } else if (!t || !c) {
        arqCell = isSup()
          ? `<span class="btn-cargar-arq" data-fecha="${fecha}" data-nt="${nt}" data-tid="${t?.id||''}">+ Cargar</span>`
          : '—';
      } else {
        arqCell = `<span class="${ok ? 'tdok' : 'tdwarn'}">${ok ? '✓' : '⚠'}</span>`;
      }

      const tr = document.createElement('tr');
      if (d > 1 && nt === 1) tr.style.borderTop = '1px solid var(--b)';

      tr.innerHTML = `
        <td style="white-space:nowrap;padding:8px 6px">${nt === 1 ? fechaCell : ''}</td>
        <td style="padding:8px 4px">${nt === 1 ? iconSolSm : iconLunaSm}</td>
        <td style="color:${esFuturo ? 'var(--t3)' : 'var(--t)'}">
          ${esFuturo ? '—' : c ? `<div style="font-size:12px;font-weight:600">${fmt(venta)}</div><div style="font-size:10px;color:var(--t3)">${cub ? cub + ' cub.' : ''}</div>` : '—'}
        </td>
        <td>${esFuturo ? '' : comprasCell}</td>
        <td style="color:${esFuturo ? 'var(--t3)' : 'var(--t)'}">
          ${esFuturo ? '—' : c ? `<div style="font-size:12px">${fmt(ef)}</div>` : '—'}
        </td>
        <td>${arqCell}</td>`;

      if (!esFuturo && t) {
        tr.style.cursor = 'pointer';
        tr.onclick = e => {
          if (e.target.classList.contains('btn-cargar-arq')) return;
          abrirMesTurno(t, c);
        };
      }

      tbody.appendChild(tr);

      if (!esFuturo && isSup()) {
        const btn = tr.querySelector('.btn-cargar-arq');
        if (btn) {
          btn.onclick = e => {
            e.stopPropagation();
            abrirMesTurnoNuevo(fecha, parseInt(btn.dataset.nt), btn.dataset.tid || null, t);
          };
        }
      }
    }
  }
}

// ── Navegar entre meses ──────────────────────────────────
async function cambiarMes(dir) {
  window.mesMonth += dir;
  if (window.mesMonth < 0)  { window.mesMonth = 11; window.mesYear--; }
  if (window.mesMonth > 11) { window.mesMonth = 0;  window.mesYear++; }
  await loadMes();
}

// ── Abrir turno desde la tabla del mes ──────────────────
async function abrirMesTurno(t, c) {
  mesTurnoActual  = t;
  mesCierreActual = c;

  const nombres = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
  const ic = document.getElementById('mmtIcon');
  ic.innerHTML  = t.numero_turno === 1 ? SVG_SOL : SVG_LUNA;
  ic.className  = 'ti ' + (t.numero_turno === 1 ? 'ti1' : 'ti2');
  document.getElementById('mmtTitle').textContent = nombres[t.numero_turno];
  document.getElementById('mmtFecha').textContent = new Date(t.fecha + 'T12:00:00')
    .toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });

  if (!c) {
    document.getElementById('mmtSinCierre').classList.remove('hidden');
    document.getElementById('mmtConCierre').classList.add('hidden');
  } else {
    document.getElementById('mmtSinCierre').classList.add('hidden');
    document.getElementById('mmtConCierre').classList.remove('hidden');

    const diff = c.efectivo_real - c.efectivo_esperado;
    const ok   = Math.abs(diff) < 50;
    document.getElementById('mmtBox').innerHTML = `
      <div class="ar"><span class="al">Venta total</span><span class="av" style="color:var(--p);font-weight:700">${fmt(c.venta_total||0)}</span></div>
      <div class="ar"><span class="al">Cubiertos</span><span class="av">${c.cubiertos||'—'}</span></div>
      ${c.cubiertos > 0 ? `<div class="ar"><span class="al">Ticket prom.</span><span class="av">${fmt(Math.round((c.venta_total||0)/(c.cubiertos||1)))}</span></div>` : ''}
      <div class="adiv"></div>
      <div class="ar"><span class="al">Efectivo esperado</span><span class="av">${fmt(c.efectivo_esperado||0)}</span></div>
      <div class="ar"><span class="al">Efectivo real</span><span class="av">${fmt(c.efectivo_real||0)}</span></div>
      <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${ok?'var(--ok)':'var(--err)'}">${diff>=0?'+':''}${fmt(diff)}</span></div>
      ${c.observaciones ? `<div class="adiv"></div><div style="font-size:12px;color:var(--t2)"><b>Obs:</b> ${c.observaciones}</div>` : ''}`;

    await renderAuditLog(t.id);

    const { data: ms } = await sb.from('movimientos')
      .select('*').eq('turno_id', t.id).neq('tipo','venta').order('created_at');
    const movsEl = document.getElementById('mmtMovs');
    movsEl.innerHTML = '';
    if (ms?.length) {
      // Resumen de compras en el modal
      const compras = ms.filter(m => ['compra','egreso'].includes(m.tipo));
      const totalCompras = compras.reduce((a,m) => a + (m.monto||0), 0);
      const eftCompras   = compras.filter(m => m.medio_pago === 'efectivo').reduce((a,m) => a + (m.monto||0), 0);
      if (compras.length > 0) {
        movsEl.innerHTML += `
          <div style="background:var(--err-bg);border-radius:var(--rs);padding:8px 12px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:var(--err);margin-bottom:4px">COMPRAS / EGRESOS</div>
            <div class="ar"><span class="al" style="font-size:12px">Total compras</span><span class="av" style="color:var(--err)">${fmt(totalCompras)}</span></div>
            <div class="ar"><span class="al" style="font-size:12px">En efectivo</span><span class="av" style="color:var(--err)">${fmt(eftCompras)}</span></div>
            <div class="ar"><span class="al" style="font-size:12px">Movimientos</span><span class="av">${compras.length}</span></div>
          </div>`;
      }
      movsEl.innerHTML += `<div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Detalle (${ms.length})</div>`;
      ms.forEach(m => {
        const d = document.createElement('div');
        d.className    = 'mov-item';
        d.style.cssText = 'cursor:pointer;margin-bottom:5px';
        d.innerHTML    = `<span class="mb mb-${m.tipo}">${m.tipo.replace(/_/g,' ')}</span><span class="mc">${m.concepto}</span><span class="mm">${fmt(m.monto)}</span>`;
        d.onclick = () => verDetalleMov(m);
        movsEl.appendChild(d);
      });
    }
  }
  document.getElementById('modalMesTurno').classList.add('open');
}

// ── Log de auditoría ─────────────────────────────────────
async function renderAuditLog(turnoId) {
  const el = document.getElementById('mmtAuditLog');
  const { data: logs } = await sb.from('auditoria_borrados')
    .select('*').eq('registro_id', turnoId).order('borrado_en', { ascending: false });
  if (!logs?.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Historial de cambios</div>`
    + logs.map(l => {
        const cuando = new Date(l.borrado_en).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 8px;background:var(--err-bg);border-radius:var(--rs);margin-bottom:4px">
          <span style="color:var(--err)">🗑 Arqueo borrado</span>
          <span style="color:var(--t3)">${cuando}</span>
        </div>`;
      }).join('');
}

// ── Borrar arqueo histórico ──────────────────────────────
async function borrarArqueoHistorico() {
  if (!mesCierreActual || !mesTurnoActual) return;
  if (!confirm('¿Borrar el arqueo de este turno? Los movimientos de caja se conservan.')) return;

  const { data: { user } } = await sb.auth.getUser();

  await sb.from('auditoria_borrados').insert({
    tabla:          'cierres_turno',
    registro_id:    mesTurnoActual.id,
    datos_borrados: mesCierreActual,
    borrado_por:    user?.id || null,
    motivo:         'Borrado manual desde vista mes'
  });

  await sb.from('movimientos').delete().eq('turno_id', mesTurnoActual.id).eq('tipo', 'venta');
  await sb.from('cierres_turno').delete().eq('turno_id', mesTurnoActual.id);
  await sb.from('turnos').update({ estado: 'abierto' }).eq('id', mesTurnoActual.id);

  closeMesTurno();
  await loadMes();
}

// ── Cargar/reeditar arqueo histórico ────────────────────
async function cargarArqueoHistorico() {
  if (!mesTurnoActual) return;
  closeMesTurno();

  window.curTurno = mesTurnoActual;
  const { data: m } = await sb.from('movimientos')
    .select('*').eq('turno_id', mesTurnoActual.id).neq('tipo','venta').order('created_at');
  window.movs = m || [];
  calcComprasEft();

  if (mesCierreActual) {
    const c = mesCierreActual;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    setVal('totalTicket',     c.venta_total);
    setVal('cubiertos',       c.cubiertos);
    setVal('efectivoReal',    c.efectivo_real);
    setVal('efectivoRealSup', c.efectivo_real);
    setVal('propinas',        c.propinas);
    setVal('obs',             c.observaciones);
  }

  show('sCierre');
  calcArq();
}

// ── Cerrar modal del turno del mes ───────────────────────
function closeMesTurno() {
  document.getElementById('modalMesTurno').classList.remove('open');
  mesTurnoActual  = null;
  mesCierreActual = null;
}

// ── Nuevo turno histórico desde el mes ───────────────────
function abrirMesTurnoNuevo(fecha, nt, turnoId, turnoObj) {
  if (turnoObj && turnoId) {
    mesTurnoActual  = turnoObj;
    mesCierreActual = null;
    cargarArqueoHistorico();
    return;
  }
  mnthFechaActual      = fecha;
  mnthTurnoExistenteId = turnoId  || null;
  mnthTurnoExistente   = turnoObj || null;

  const fechaObj = new Date(fecha + 'T12:00:00');
  document.getElementById('mnthFecha').textContent  = fechaObj.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('mnthTitulo').textContent = 'Nuevo turno histórico';
  document.getElementById('mnthTurno').value        = String(nt);
  document.getElementById('mnthSaldo').value        = '';
  document.getElementById('modalNuevoTurnoHist').classList.add('open');
}

async function crearTurnoHistorico() {
  const nt    = parseInt(document.getElementById('mnthTurno').value);
  const saldo = parseFloat(document.getElementById('mnthSaldo').value) || 0;
  document.getElementById('modalNuevoTurnoHist').classList.remove('open');

  const { data: t, error } = await sb.from('turnos').insert({
    local_id:      window.localId,
    fecha:         mnthFechaActual,
    numero_turno:  nt,
    saldo_inicial: saldo,
    estado:        'abierto'
  }).select().single();

  if (error) { alert('Error al crear turno: ' + error.message); return; }

  window.curTurno = t;
  window.movs     = [];

  const nombres   = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
  const fechaDisp = new Date(t.fecha + 'T12:00:00')
    .toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' });

  document.getElementById('tBanner').innerHTML = `
    <div class="banner-top">
      <div class="banner-name">${nombres[t.numero_turno]}</div>
      <span class="banner-status">Histórico</span>
    </div>
    <div class="banner-sub">${fechaDisp} · Saldo inicial ${fmt(t.saldo_inicial)}</div>`;

  document.getElementById('btnCerrarDash').style.display = 'block';
  renderMovs();
  show('sDash');
}
