// cc_movimientos.js — ChefController
// Modal de carga de movimientos, render de lista, detalle, alivios de caja
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_proveedores.js

// ── Modal de movimiento ──────────────────────────────────
function openModal() {
  document.getElementById('modalBg').classList.add('open');
  tipoMovChanged();
}
function closeModal() {
  document.getElementById('modalBg').classList.remove('open');
}

// ── Agregar movimiento ───────────────────────────────────
async function addMov() {
  const tipo     = document.getElementById('mTipo').value;
  const selProv  = document.getElementById('mProveedor');
  let concepto   = '';

  if (tipo === 'compra' && selProv.value && selProv.value !== '__otro__') {
    concepto = selProv.value;
  } else {
    concepto = document.getElementById('mConcepto').value.trim();
  }

  const monto = parseFloat(document.getElementById('mMonto').value) || 0;
  const pago  = document.getElementById('mPago').value;
  const ref   = document.getElementById('mRef').value.trim();
  const obs_mov = document.getElementById('mObs').value.trim();

  if (!concepto || monto <= 0) { alert('Completá el concepto y el monto'); return; }

  const { data: mov } = await sb.from('movimientos').insert({
    turno_id:     window.curTurno.id,
    tipo,
    concepto,
    monto,
    medio_pago:   pago,
    referencia:   ref || null,
    observaciones: obs_mov || null
  }).select().single();

  if (mov) {
    window.movs.push(mov);
    renderMovs();
    closeModal();
    // Limpiar campos del modal
    ['mConcepto','mMonto','mRef'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('mProveedor').value = '';
    document.getElementById('mObs').value = '';
    document.getElementById('fdProveedor').style.display = 'none';
    document.getElementById('fdConcepto').style.display  = 'block';
    document.getElementById('mTipo').value = 'compra';
    tipoMovChanged();
  }
}

// ── Borrar movimiento ────────────────────────────────────
async function delMov(id, i) {
  if (id) await sb.from('movimientos').delete().eq('id', id);
  window.movs.splice(i, 1);
  renderMovs();
}

// ── Renderizar lista de movimientos ─────────────────────
function renderMovs() {
  const list = document.getElementById('movList');
  if (!window.movs.length) {
    list.innerHTML = '<div class="mov-empty">Sin movimientos. Usá + Agregar para cargar compras, egresos y más.</div>';
    return;
  }
  list.innerHTML = '';
  window.movs.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'mov-item';
    div.style.cursor = 'pointer';
    div.innerHTML = `
      <span class="mb mb-${m.tipo}">${m.tipo.replace(/_/g,' ')}</span>
      <span class="mc">${m.concepto}</span>
      <span class="mm">${fmt(m.monto)}</span>
      <button class="mov-del" onclick="event.stopPropagation();delMov('${m.id||''}',${i})">×</button>`;
    div.onclick = () => verDetalleMov(m);
    list.appendChild(div);
  });
}

// ── Sincronizar campo efectivo real (ciego ↔ supervisor) ─
function syncEfectivo() {
  const v = document.getElementById('efectivoRealSup').value;
  document.getElementById('efectivoReal').value = v;
}

// ── Compras en efectivo + alerta ─────────────────────────
function calcComprasEft() {
  const total = window.movs
    .filter(m => ['compra','egreso'].includes(m.tipo) && m.medio_pago === 'efectivo')
    .reduce((acc, m) => acc + (m.monto || 0), 0);
  const input = document.getElementById('comprasEft');
  if (input) input.value = total > 0 ? fmt(Math.round(total)) : '';
  const warn = document.getElementById('comprasWarn');
  if (warn) warn.classList.toggle('hidden', total > 0);
}

// ── Ir a cargar compras desde la alerta ──────────────────
function irACargarCompras() {
  renderMovs();
  document.getElementById('btnCerrarDash').style.display = 'block';
  show('sDash');
  setTimeout(() => {
    document.getElementById('mTipo').value = 'compra';
    tipoMovChanged();
    openModal();
  }, 150);
}

// ── Detalle de movimiento (modal) ────────────────────────
function verDetalleMov(m) {
  const tipoLabel = {
    compra:                 'Compra / Proveedor',
    egreso:                 'Egreso',
    reingreso:              'Reingreso',
    retiro:                 'Retiro',
    nota_credito_proveedor: 'N/C Proveedor',
    nota_credito_cliente:   'N/C Cliente',
    venta:                  'Venta',
    alivio:                 'Alivio de caja'
  }[m.tipo] || m.tipo;

  const pagoLabel = {
    efectivo:          'Efectivo',
    cuenta_corriente:  'Cta. Corriente',
    mercado_pago:      'Mercado Pago',
    visa_credito:      'Visa',
    master_credito:    'Mastercard',
    visa_debito:       'Visa Electron',
    maestro:           'Maestro',
    cabal:             'Cabal',
    pedidos_ya:        'PedidosYa',
    otro:              'Otro'
  }[m.medio_pago] || m.medio_pago || '—';

  const fecha = m.created_at
    ? new Date(m.created_at).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : '—';

  document.getElementById('mmdContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span class="mb mb-${m.tipo}" style="font-size:11px;padding:4px 10px">${tipoLabel}</span>
      <span style="font-size:12px;color:var(--t2)">${fecha}</span>
    </div>
    <div style="font-size:26px;font-weight:700;color:var(--t);margin-bottom:16px">${fmt(m.monto)}</div>
    <div class="arq-box">
      <div class="ar"><span class="al">Concepto</span><span class="av" style="text-align:right;max-width:60%">${m.concepto||'—'}</span></div>
      <div class="ar"><span class="al">Forma de pago</span><span class="av">${pagoLabel}</span></div>
      ${m.referencia ? `<div class="ar"><span class="al">N° Factura</span><span class="av">${m.referencia}</span></div>` : ''}
      ${m.origen     ? `<div class="ar"><span class="al">Origen</span><span class="av">${m.origen}</span></div>` : ''}
      ${m.observaciones ? `<div class="adiv"></div><div style="font-size:12px;color:var(--t2);padding:2px 0"><b>Obs:</b> ${m.observaciones}</div>` : ''}
    </div>`;
  document.getElementById('modalMovDet').classList.add('open');
}
