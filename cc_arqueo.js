// cc_arqueo.js — ChefController
// Cálculo de arqueo en tiempo real y submit de cierre de turno
// Depende de: cc_config.js, cc_utils.js, cc_auth.js, cc_movimientos.js
 
// ── Calcular arqueo en tiempo real ───────────────────────
function calcArq() {
  const tk  = n('totalTicket');
  const cub = n('cubiertos');
  if (cub > 0) document.getElementById('ticketProm').value = fmt(Math.round(tk / cub));
  else         document.getElementById('ticketProm').value = '';
 
  if (!isSup()) return;
 
  const totalX   = n('totalTicket') + n('totalFCA') + n('totalFCB') + n('factManual') - n('totalNC') - n('descuentos');
  const mp       = n('mpago');
  const tarjetas = n('visa') + n('master') + n('amex') + n('electron') + n('maestro') + n('cabal') + n('giftcard') + n('otras');
  const ctacte   = n('ctacte');
  const delivery = n('pya_tar') + n('pya_ef') + n('rappi_tar') + n('rappi_ef') + n('mpd_tar') + n('mpd_ef');
  const alivios  = window.movs.filter(m => m.tipo === 'alivio').reduce((a, m) => a + (m.monto || 0), 0);
 
  // Compras/egresos pagados en efectivo del turno — descuentan del efectivo esperado
  const comprasEfectivo = window.movs
    .filter(m => ['compra','egreso'].includes(m.tipo) && m.medio_pago === 'efectivo')
    .reduce((a, m) => a + (m.monto || 0), 0);
 
  const efEsp  = totalX - tarjetas - ctacte - mp - delivery - alivios - comprasEfectivo;
  const efReal = n('efectivoRealSup') || n('efectivoReal');
  const diff   = efReal - efEsp;
  const ok     = Math.abs(diff) < 50;
 
  const box = document.getElementById('arqBox');
  if (!box) return;
 
  box.innerHTML = `
    <div class="ar"><span class="al">Venta total</span><span class="av">${fmt(totalX)}</span></div>
    <div class="adiv"></div>
    <div class="ar"><span class="al">− Tarjetas</span><span class="av">${fmt(tarjetas)}</span></div>
    <div class="ar"><span class="al">− Mercado Pago</span><span class="av">${fmt(mp)}</span></div>
    <div class="ar"><span class="al">− Delivery</span><span class="av">${fmt(delivery)}</span></div>
    <div class="ar"><span class="al">− Cta. Cte. clientes</span><span class="av">${fmt(ctacte)}</span></div>
    ${comprasEfectivo > 0 ? `<div class="ar"><span class="al">− Compras en efectivo</span><span class="av" style="color:var(--err)">${fmt(comprasEfectivo)}</span></div>` : ''}
    ${alivios > 0 ? `<div class="ar"><span class="al">− Alivios / Sobres</span><span class="av" style="color:#92400E">${fmt(alivios)}</span></div>` : ''}
    <div class="adiv"></div>
    <div class="ar at"><span class="al">Efectivo esperado</span><span class="av" style="color:var(--p)">${fmt(efEsp)}</span></div>
    <div class="adiv"></div>
    <div class="ar at"><span class="al">Efectivo real en caja</span><span class="av">${fmt(efReal)}</span></div>
    <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${ok ? 'var(--ok)' : 'var(--err)'}">${diff >= 0 ? '+' : ''}${fmt(diff)}</span></div>
    <div class="amatch ${ok ? 'ok' : 'warn'}">${ok ? '✓ Arqueo correcto' : '⚠ Revisar diferencia'}</div>`;
}
 
// ── Sincronizar efectivo real (campo ciego ↔ supervisor) ─
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
    const tarjetas = n('visa') + n('master') + n('amex') + n('electron') + n('maestro') + n('cabal') + n('giftcard') + n('otras');
    const ctacte   = n('ctacte');
    const mp       = n('mpago');
    const delivery = n('pya_tar') + n('pya_ef') + n('rappi_tar') + n('rappi_ef') + n('mpd_tar') + n('mpd_ef');
    const alivios  = window.movs.filter(m => m.tipo === 'alivio').reduce((a, m) => a + (m.monto || 0), 0);
    const comprasEfectivo = window.movs
      .filter(m => ['compra','egreso'].includes(m.tipo) && m.medio_pago === 'efectivo')
      .reduce((a, m) => a + (m.monto || 0), 0);
    const efEsp    = totalX - tarjetas - ctacte - mp - delivery - alivios - comprasEfectivo;
    const diff     = efReal - efEsp;
    const ok       = Math.abs(diff) < 50;
    const cubiertos = parseInt(n('cubiertos')) || 0;
    const propinas  = n('propinas');
 
    // 1. Guardar cierre
    await sb.from('cierres_turno').upsert({
      turno_id:          window.curTurno.id,
      venta_total:       totalX,
      cubiertos,
      efectivo_esperado: efEsp,
      efectivo_real:     efReal,
      propinas,
      observaciones:     document.getElementById('obs').value || null
    }, { onConflict: 'turno_id' });
 
    // 2. Movimientos de venta por medio de pago
    const medios = [
      ['visa',     'visa_credito',     'Visa',                'salon'],
      ['master',   'master_credito',   'Mastercard',          'salon'],
      ['amex',     'otro',             'American Express',    'salon'],
      ['electron', 'visa_debito',      'Visa Electron',       'salon'],
      ['maestro',  'maestro',          'Maestro',             'salon'],
      ['cabal',    'cabal',            'Cabal',               'salon'],
      ['mpago',    'mercado_pago',     'Mercado Pago',        'salon'],
      ['giftcard', 'otro',             'Gift Card',           'salon'],
      ['otras',    'otro',             'Otras tarjetas',      'salon'],
      ['ctacte',   'cuenta_corriente', 'Cta. Cte. clientes',  'salon'],
      ['pya_tar',  'pedidos_ya',       'PedidosYa tarjeta',   'delivery'],
      ['pya_ef',   'efectivo',         'PedidosYa efectivo',  'delivery'],
      ['rappi_tar','otro',             'Rappi tarjeta',       'delivery'],
      ['rappi_ef', 'efectivo',         'Rappi efectivo',      'delivery'],
      ['mpd_tar',  'mercado_pago',     'MP Delivery tarjeta', 'delivery'],
      ['mpd_ef',   'efectivo',         'MP Delivery efectivo','delivery'],
    ];
 
    const ventaMovs = medios
      .filter(([col]) => n(col) > 0)
      .map(([col, medio, concepto, origen]) => ({
        turno_id: window.curTurno.id, tipo: 'venta', concepto, monto: n(col), medio_pago: medio, origen
      }));
 
    if (efReal > 0) ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'venta', concepto: 'Efectivo salón', monto: efReal, medio_pago: 'efectivo', origen: 'salon' });
    if (n('totalFCA') > 0) ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'venta', concepto: 'Factura A', monto: n('totalFCA'), medio_pago: 'cuenta_corriente', origen: 'salon' });
    if (n('totalNC')  > 0) ventaMovs.push({ turno_id: window.curTurno.id, tipo: 'nota_credito_cliente', concepto: 'N/C cliente', monto: n('totalNC'), medio_pago: 'efectivo', origen: 'salon' });
 
    await sb.from('movimientos').delete().eq('turno_id', window.curTurno.id).eq('tipo', 'venta');
    await sb.from('movimientos').insert(ventaMovs);
 
    // 3. Marcar turno cerrado
    await sb.from('turnos').update({ estado: 'cerrado' }).eq('id', window.curTurno.id);
 
    // 4. Comprobante de cierre
    const nombres   = { 1: 'Turno 1 — Mañana', 2: 'Turno 2 — Noche' };
    const fechaDisp = new Date(window.curTurno.fecha + 'T12:00:00')
      .toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const estado      = ok ? '✓ Cerrado correctamente' : '⚠ Cerrado con diferencias';
    const estadoColor = ok ? 'var(--ok)' : 'var(--err)';
    const tktProm     = cubiertos > 0 ? fmt(Math.round(totalX / cubiertos)) : '—';
 
    const textoWA = `*ChefController — Cierre de turno*
Local: ${window.localNombre}
Fecha: ${fechaDisp}
Turno: ${nombres[window.curTurno.numero_turno]}
 
💰 Venta total: ${fmt(totalX)}
🧾 Cubiertos: ${cubiertos}
🎯 Ticket prom.: ${tktProm}
 
💳 Tarjetas: ${fmt(tarjetas)}
📱 Mercado Pago: ${fmt(mp)}
🛵 Delivery: ${fmt(delivery)}
📋 Cta. Cte.: ${fmt(ctacte)}
🛒 Compras efectivo: ${fmt(comprasEfectivo)}${alivios > 0 ? `\n📦 Alivios: ${fmt(alivios)}` : ''}${propinas > 0 ? `\n🙏 Propinas: ${fmt(propinas)}` : ''}
 
💵 Efectivo esperado: ${fmt(efEsp)}
💵 Efectivo real: ${fmt(efReal)}
${ok ? `✅ Diferencia: ${diff >= 0 ? '+' : ''}${fmt(diff)}` : `⚠️ Diferencia: ${diff >= 0 ? '+' : ''}${fmt(diff)}`}
Estado: ${ok ? 'Cerrado correctamente ✓' : 'Con diferencias ⚠'}`;
 
    document.getElementById('sCard').innerHTML = `
      <div style="font-size:13px;font-weight:600;color:${estadoColor};margin-bottom:12px;padding:8px;background:${ok ? 'var(--ok-bg)' : 'var(--err-bg)'};border-radius:var(--rs);text-align:center">${estado}</div>
      <div class="ar"><span class="al">Local</span><span class="av">${window.localNombre}</span></div>
      <div class="ar"><span class="al">Fecha</span><span class="av">${fechaDisp}</span></div>
      <div class="ar"><span class="al">Turno</span><span class="av">${nombres[window.curTurno.numero_turno]}</span></div>
      <div class="adiv"></div>
      <div class="ar"><span class="al">Venta total</span><span class="av" style="font-weight:700;color:var(--p)">${fmt(totalX)}</span></div>
      <div class="ar"><span class="al">Cubiertos</span><span class="av">${cubiertos}</span></div>
      <div class="ar"><span class="al">Ticket promedio</span><span class="av">${tktProm}</span></div>
      <div class="adiv"></div>
      <div class="ar"><span class="al">Tarjetas</span><span class="av">${fmt(tarjetas)}</span></div>
      <div class="ar"><span class="al">Mercado Pago</span><span class="av">${fmt(mp)}</span></div>
      <div class="ar"><span class="al">Delivery</span><span class="av">${fmt(delivery)}</span></div>
      <div class="ar"><span class="al">Cta. Cte. clientes</span><span class="av">${fmt(ctacte)}</span></div>
      <div class="ar"><span class="al">Compras en efectivo</span><span class="av">${fmt(comprasEfectivo)}</span></div>
      ${alivios > 0 ? `<div class="ar"><span class="al">Alivios / Sobres</span><span class="av">${fmt(alivios)}</span></div>` : ''}
      ${propinas > 0 ? `<div class="ar"><span class="al">Propinas</span><span class="av">${fmt(propinas)}</span></div>` : ''}
      <div class="adiv"></div>
      <div class="ar"><span class="al">Efectivo esperado</span><span class="av">${fmt(efEsp)}</span></div>
      <div class="ar"><span class="al">Efectivo real</span><span class="av">${fmt(efReal)}</span></div>
      <div class="ar"><span class="al">Diferencia</span><span class="av" style="color:${estadoColor};font-weight:700">${diff >= 0 ? '+' : ''}${fmt(diff)}</span></div>
      <div class="adiv"></div>
      <div class="ar"><span class="al">Movimientos cargados</span><span class="av">${window.movs.filter(m=>m.tipo!=='venta').length}</span></div>
      <button onclick="compartirCierre()" id="btnWA" style="width:100%;margin-top:14px;padding:12px;background:#25D366;border:none;border-radius:var(--rs);color:#fff;font-size:14px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Compartir por WhatsApp
      </button>`;
 
    // Guardar texto WA para el botón
    window._textoWA = textoWA;
    show('sSuccess');
 
  } catch (err) {
    alert('Error al guardar: ' + err.message);
    btn.disabled    = false;
    btn.textContent = 'Confirmar cierre';
  }
}
 
// ── Compartir comprobante por WhatsApp ───────────────────
function compartirCierre() {
  window.open('https://wa.me/?text=' + encodeURIComponent(window._textoWA), '_blank');
}
 
