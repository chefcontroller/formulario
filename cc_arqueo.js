// cc_arqueo.js — ChefController
// Cálculo de arqueo en tiempo real y submit de cierre de turno
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_movimientos.js

// ── Calcular arqueo en tiempo real ───────────────────────
// Se llama con oninput en todos los campos del formulario de cierre
function calcArq() {
  // Ticket promedio automático (visible para todos los roles)
  const tk  = n('totalTicket');
  const cub = n('cubiertos');
  if (cub > 0) document.getElementById('ticketProm').value = fmt(Math.round(tk / cub));
  else         document.getElementById('ticketProm').value = '';

  // El desglose completo solo lo ve supervisor/admin/dueno
  if (!isSup()) return;

  const totalX   = n('totalTicket') + n('totalFCA') + n('totalFCB') + n('factManual') - n('totalNC') - n('descuentos');
  const mp       = n('mpago');
  const tarjetas = n('visa') + n('master') + n('amex') + n('electron') + n('maestro') + n('cabal') + n('giftcard') + n('otras') + n('ctacte');
  const delivery = n('pya_tar') + n('pya_ef') + n('rappi_tar') + n('rappi_ef') + n('mpd_tar') + n('mpd_ef');
  const alivios  = window.movs.filter(m => m.tipo === 'alivio').reduce((a, m) => a + (m.monto || 0), 0);

  const efEsp = totalX - tarjetas - mp - delivery - alivios;
  const efReal = n('efectivoRealSup') || n('efectivoReal');
  const diff   = efReal - efEsp;
  const ok     = Math.abs(diff) < 50;

  const box = document.getElementById('arqBox');
  if (!box) return;

  box.innerHTML = `
    <div class="ar"><span class="al">Total X</span><span class="av">${fmt(totalX)}</span></div>
    <div class="adiv"></div>
    <div class="ar"><span class="al">− Tarjetas</span><span class="av">${fmt(tarjetas)}</span></div>
    <div class="ar"><span class="al">− Mercado Pago</span><span class="av">${fmt(mp)}</span></div>
    <div class="ar"><span class="al">− Delivery</span><span class="av">${fmt(delivery)}</span></div>
    ${alivios > 0 ? `<div class="ar"><span class="al">− Alivios / Sobres</span><span class="av" style="color:#92400E">${fmt(alivios)}</span></div>` : ''}
    <div class="adiv"></div>
    <div class="ar at"><span class="al">Efectivo esperado</span><span class="av" style="color:var(--p)">${fmt(efEsp)}</span></div>
    <div class="adiv"></div>
    <div class="ar at"><span class="al">Efectivo real</span><span class="av">${fmt(efReal)}</span></div>
    <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${ok ? 'var(--ok)' : 'var(--err)'}">${diff >= 0 ? '+' : ''}${fmt(diff)}</span></div>
    <div class="amatch ${ok ? 'ok' : 'warn'}">${ok ? '✓ Arqueo correcto' : '⚠ Revisar diferencia'}</div>`;
}

// ── Sincronizar efectivo real (campo ciego ↔ supervisor) ─
// (también está en cc_movimientos pero se llama desde oninput del cierre)
function syncEfectivo() {
  const v = document.getElementById('efectivoRealSup').value;
  document.getElementById('efectivoReal').value = v;
}

// ── Submit de cierre de turno ────────────────────────────
async function submitCierre() {
  const btn = document.getElementById('btnCerrar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const efReal   = n('efectivoRealSup') || n('efectivoReal');
    const totalX   = n('totalTicket') + n('totalFCA') + n('totalFCB') + n('factManual') - n('totalNC') - n('descuentos');
    const tarjetas = n('visa') + n('master') + n('amex') + n('electron') + n('maestro') + n('cabal') + n('mpago') + n('giftcard') + n('otras') + n('ctacte');
    const delivery = n('pya_tar') + n('pya_ef') + n('rappi_tar') + n('rappi_ef') + n('mpd_tar') + n('mpd_ef');
    const alivios  = window.movs.filter(m => m.tipo === 'alivio').reduce((a, m) => a + (m.monto || 0), 0);
    const efEsp    = totalX - tarjetas - delivery - alivios;

    // 1. Guardar cierre (upsert por si es una reedición)
    await sb.from('cierres_turno').upsert({
      turno_id:         window.curTurno.id,
      venta_total:      totalX,
      cubiertos:        parseInt(n('cubiertos')),
      efectivo_esperado: efEsp,
      efectivo_real:    efReal,
      propinas:         n('propinas'),
      observaciones:    document.getElementById('obs').value || null
    }, { onConflict: 'turno_id' });

    // 2. Generar movimientos de venta (uno por medio de pago)
    const medios = [
      ['visa',     'visa_credito',      'Visa',               'salon'],
      ['master',   'master_credito',    'Mastercard',         'salon'],
      ['amex',     'otro',              'American Express',   'salon'],
      ['electron', 'visa_debito',       'Visa Electron',      'salon'],
      ['maestro',  'maestro',           'Maestro',            'salon'],
      ['cabal',    'cabal',             'Cabal',              'salon'],
      ['mpago',    'mercado_pago',      'Mercado Pago',       'salon'],
      ['giftcard', 'otro',              'Gift Card',          'salon'],
      ['otras',    'otro',              'Otras',              'salon'],
      ['ctacte',   'cuenta_corriente',  'Cta. Corriente',    'salon'],
      ['pya_tar',  'pedidos_ya',        'PedidosYa tarjeta', 'delivery'],
      ['pya_ef',   'efectivo',          'PedidosYa efectivo','delivery'],
      ['rappi_tar','otro',              'Rappi tarjeta',     'delivery'],
      ['rappi_ef', 'efectivo',          'Rappi efectivo',    'delivery'],
      ['mpd_tar',  'mercado_pago',      'MP Delivery tarjeta','delivery'],
      ['mpd_ef',   'efectivo',          'MP Delivery efectivo','delivery'],
    ];

    const ventaMovs = medios
      .filter(([col]) => n(col) > 0)
      .map(([col, medio, concepto, origen]) => ({
        turno_id:  window.curTurno.id,
        tipo:      'venta',
        concepto,
        monto:     n(col),
        medio_pago: medio,
        origen
      }));

    // Efectivo salón
    ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'venta', concepto: 'Efectivo salón', monto: efReal, medio_pago: 'efectivo', origen: 'salon' });
    // Factura A si tiene
    if (n('totalFCA') > 0) ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'venta', concepto: 'Factura A', monto: n('totalFCA'), medio_pago: 'cuenta_corriente', origen: 'salon' });
    // NC cliente si tiene
    if (n('totalNC') > 0)  ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'nota_credito_cliente', concepto: 'Nota de crédito cliente', monto: n('totalNC'), medio_pago: 'efectivo', origen: 'salon' });

    // Reemplazar movimientos de venta anteriores (si es reedición)
    await sb.from('movimientos').delete().eq('turno_id', window.curTurno.id).eq('tipo', 'venta');
    await sb.from('movimientos').insert(ventaMovs);

    // 3. Marcar turno como cerrado
    await sb.from('turnos').update({ estado: 'cerrado' }).eq('id', window.curTurno.id);

    // 4. Mostrar pantalla de éxito
    document.getElementById('sCard').innerHTML = `
      <div class="ar"><span class="al">Local</span><span class="av">${window.localNombre}</span></div>
      <div class="ar"><span class="al">Turno</span><span class="av">Turno ${window.curTurno.numero_turno} · ${window.curTurno.fecha}</span></div>
      <div class="adiv"></div>
      <div class="ar"><span class="al">Total X</span><span class="av">${fmt(totalX)}</span></div>
      <div class="ar"><span class="al">Cubiertos</span><span class="av">${parseInt(n('cubiertos'))}</span></div>
      <div class="ar"><span class="al">Efectivo real</span><span class="av">${fmt(efReal)}</span></div>
      <div class="ar"><span class="al">Movimientos</span><span class="av">${window.movs.length}</span></div>
      <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${Math.abs(efReal - efEsp) < 50 ? 'var(--ok)' : 'var(--err)'}">${fmt(efReal - efEsp)}</span></div>`;

    show('sSuccess');

  } catch (err) {
    alert('Error al guardar: ' + err.message);
    btn.disabled    = false;
    btn.textContent = 'Confirmar cierre';
  }
}
