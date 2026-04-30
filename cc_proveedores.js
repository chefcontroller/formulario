// cc_proveedores.js — ChefController
// ABM completo de proveedores + integración con modal de movimientos
// Depende de: cc_config.js, cc_utils.js, cc_auth.js

// ── Estado ───────────────────────────────────────────────
let proveedores    = [];   // usados en el modal de movimientos (activos)
let allProveedores = [];   // usados en el ABM (todos)
let activeFood     = 'todos';
let activeRubro    = '';
let currentProvIva = null;

// ── Cargar proveedores activos (para modal de movimientos) ──
async function loadProveedores() {
  const { data } = await sb.from('proveedores')
    .select('id, nombre, rubro, medio_pago, afecta_food, activo')
    .eq('activo', true)
    .order('nombre');
  if (data) {
    proveedores = data.map(p => ({
      id:          p.id,
      proveedor:   p.nombre,
      nombre:      p.nombre,
      rubro:       p.rubro || '',
      pago:        p.medio_pago || 'efectivo',
      afecta_food: p.afecta_food
    }));
  }
}

// ── Cargar lista completa (para ABM) ────────────────────
async function loadProveedoresList() {
  const { data } = await sb.from('proveedores').select('*').order('nombre');
  if (data) {
    allProveedores = data;
    activeFood = 'todos';
    activeRubro = '';
    renderRubroChips(data);
    renderProvList(data);
  }
}

// ── Render lista de proveedores ──────────────────────────
function renderProvList(lista) {
  const wrap = document.getElementById('provList');
  wrap.innerHTML = '';
  if (!lista.length) { wrap.innerHTML = '<div class="mov-empty">Sin proveedores</div>'; return; }

  lista.forEach(p => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--s);border:1px solid var(--b);border-radius:var(--rs);padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer';
    div.onclick = () => editarProveedor(p);
    const food   = p.afecta_food
      ? '<span style="font-size:9px;background:var(--ok-bg);color:var(--ok);padding:1px 6px;border-radius:20px">Foodcost</span>'
      : '<span style="font-size:9px;background:var(--bg);color:var(--t3);padding:1px 6px;border-radius:20px">Indirecto</span>';
    const activo = p.activo ? '' : '<span style="font-size:9px;background:var(--err-bg);color:var(--err);padding:1px 6px;border-radius:20px">Inactivo</span>';
    const ivaLabel = { 1.21:'21%', 1.105:'10.5%', 1:'Mono', 0:'Sin IVA' }[p.iva] || p.iva;
    div.innerHTML = `
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${p.nombre}</div>
        <div style="font-size:11px;color:var(--t2);margin-top:2px">${p.rubro||'Sin rubro'} · IVA ${ivaLabel} · ${p.medio_pago||'efectivo'}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center">${food}${activo}</div>`;
    wrap.appendChild(div);
  });
}

// ── Chips de rubros ──────────────────────────────────────
function renderRubroChips(lista) {
  const rubros = [...new Set(lista.map(p => p.rubro).filter(Boolean))].sort();
  const wrap   = document.getElementById('rubroChips');
  wrap.innerHTML = '';
  activeRubro = '';
  rubros.forEach(r => {
    const chip = document.createElement('button');
    chip.className    = 'rubro-chip';
    chip.dataset.rubro = r;
    chip.textContent  = r;
    chip.style.cssText = 'padding:3px 10px;border:1px solid var(--b);border-radius:20px;background:var(--bg);color:var(--t2);font-size:11px;font-family:Inter,sans-serif;cursor:pointer;white-space:nowrap';
    chip.onclick = () => filterProvRubro(r);
    wrap.appendChild(chip);
  });
}

// ── Filtros ──────────────────────────────────────────────
function filterProvList() { applyFilters(); }

function filterProvFood(tipo) {
  activeFood  = tipo;
  activeRubro = '';
  ['todos','food','nofood'].forEach(t => {
    const btn = document.getElementById('fbt-' + t);
    if (btn) {
      btn.style.background  = t === tipo ? 'var(--p)' : 'var(--s)';
      btn.style.color       = t === tipo ? '#fff'     : 'var(--t2)';
      btn.style.borderColor = t === tipo ? 'var(--p)' : 'var(--b)';
    }
  });
  document.querySelectorAll('.rubro-chip').forEach(c => {
    c.style.background  = 'var(--bg)';
    c.style.color       = 'var(--t2)';
    c.style.borderColor = 'var(--b)';
  });
  let subconjunto = allProveedores;
  if (tipo === 'food')   subconjunto = allProveedores.filter(p =>  p.afecta_food);
  if (tipo === 'nofood') subconjunto = allProveedores.filter(p => !p.afecta_food);
  renderRubroChips(subconjunto);
  applyFilters();
}

function filterProvRubro(rubro) {
  activeRubro = activeRubro === rubro ? '' : rubro;
  document.querySelectorAll('.rubro-chip').forEach(c => {
    const active = c.dataset.rubro === activeRubro;
    c.style.background  = active ? 'var(--pd)' : 'var(--bg)';
    c.style.color       = active ? '#fff'      : 'var(--t2)';
    c.style.borderColor = active ? 'var(--pd)' : 'var(--b)';
  });
  applyFilters();
}

function applyFilters() {
  let lista = allProveedores;
  if (activeFood === 'food')   lista = lista.filter(p =>  p.afecta_food);
  if (activeFood === 'nofood') lista = lista.filter(p => !p.afecta_food);
  if (activeRubro) lista = lista.filter(p => p.rubro === activeRubro);
  const q = document.getElementById('provSearch').value.toLowerCase();
  if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q) || (p.rubro||'').toLowerCase().includes(q));
  renderProvList(lista);
}

// ── Editar / Nuevo proveedor ─────────────────────────────
function editarProveedor(p) {
  document.getElementById('nuevProvTitle').textContent = 'Editar proveedor';
  document.getElementById('editProvId').value  = p.id;
  document.getElementById('npNombre').value    = p.nombre || '';
  document.getElementById('npCuit').value      = p.cuit   || '';
  document.getElementById('npRubro').value     = p.rubro  || '';
  document.getElementById('npTipo').value      = p.tipo   || 'directo';
  document.getElementById('npIva').value       = p.iva    || 1.21;
  document.getElementById('npPago').value      = p.medio_pago || 'efectivo';
  document.getElementById('npFood').value      = p.afecta_food ? 'true' : 'false';
  document.getElementById('npActivo').value    = p.activo  ? 'true' : 'false';
  show('sNuevoProv');
}

function nuevoProveedor() {
  document.getElementById('nuevProvTitle').textContent = 'Nuevo proveedor';
  document.getElementById('editProvId').value = '';
  ['npNombre','npCuit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('npRubro').value  = '';
  document.getElementById('npTipo').value   = 'directo';
  document.getElementById('npIva').value    = '1.21';
  document.getElementById('npPago').value   = 'efectivo';
  document.getElementById('npFood').value   = 'true';
  document.getElementById('npActivo').value = 'true';
  show('sNuevoProv');
}

async function guardarProveedor() {
  const nombre = document.getElementById('npNombre').value.trim();
  if (!nombre) { alert('El nombre es obligatorio'); return; }

  const editId = document.getElementById('editProvId').value;
  const datos  = {
    grupo_id:    CC_CONFIG.grupos.default,
    nombre,
    cuit:        document.getElementById('npCuit').value.trim()  || null,
    rubro:       document.getElementById('npRubro').value         || null,
    tipo:        document.getElementById('npTipo').value,
    iva:         parseFloat(document.getElementById('npIva').value) || 1.21,
    medio_pago:  document.getElementById('npPago').value,
    afecta_food: document.getElementById('npFood').value   === 'true',
    activo:      document.getElementById('npActivo').value === 'true',
  };

  let error;
  if (editId) {
    ({ error } = await sb.from('proveedores').update(datos).eq('id', editId));
  } else {
    ({ error } = await sb.from('proveedores').insert(datos));
  }
  if (error) { alert('Error: ' + error.message); return; }

  await loadProveedores();
  await loadProveedoresList();
  show('sProveedores');
}

// ── Integración con modal de movimiento ──────────────────
function tipoMovChanged() {
  const tipo   = document.getElementById('mTipo').value;
  const fdProv = document.getElementById('fdProveedor');
  const fdConc = document.getElementById('fdConcepto');

  if (tipo === 'compra') {
    fdProv.style.display = 'block';
    fdConc.style.display = 'none';
    const sel = document.getElementById('mProveedor');
    sel.innerHTML = '<option value="">Seleccioná un proveedor...</option>';
    proveedores.forEach(p => {
      const opt = document.createElement('option');
      opt.value        = p.proveedor || p.nombre;
      opt.dataset.pago = p.pago || 'efectivo';
      opt.dataset.iva  = p.iva  || 1.21;
      opt.textContent  = (p.proveedor || p.nombre) + (p.rubro ? ' — ' + p.rubro : '');
      sel.appendChild(opt);
    });
    const otro = document.createElement('option');
    otro.value       = '__otro__';
    otro.textContent = 'Otro / nuevo proveedor...';
    sel.appendChild(otro);
  } else {
    fdProv.style.display = 'none';
    fdConc.style.display = 'block';
    document.getElementById('mConcepto').value = '';
  }
}

function seleccionarProveedor() {
  const sel = document.getElementById('mProveedor');
  const val = sel.value;
  const fdConc = document.getElementById('fdConcepto');

  if (val === '__otro__') {
    fdConc.style.display = 'block';
    document.getElementById('mConcepto').value = '';
    document.getElementById('mConcepto').focus();
    document.getElementById('fdIVA').style.display = 'none';
    currentProvIva = null;
  } else if (val) {
    fdConc.style.display = 'none';
    const opt    = sel.options[sel.selectedIndex];
    const pago   = opt.dataset.pago || 'efectivo';
    const pagoMap = { 'contado':'efectivo', 'cta cte':'cuenta_corriente', 'cuenta corriente':'cuenta_corriente' };
    const pagoVal = pagoMap[pago.toLowerCase()] || pago;
    document.getElementById('mPago').value = pagoVal;
    // IVA del proveedor
    const iva = parseFloat(opt.dataset.iva) || null;
    currentProvIva = iva;
    if (iva && iva !== 1) {
      document.getElementById('fdIVA').style.display = 'grid';
      calcIVA();
    } else {
      document.getElementById('fdIVA').style.display = 'none';
    }
  } else {
    fdConc.style.display = 'none';
    document.getElementById('fdIVA').style.display = 'none';
    currentProvIva = null;
  }
}

function calcIVA() {
  const total = parseFloat(document.getElementById('mMonto').value) || 0;
  if (!currentProvIva || currentProvIva === 1 || total === 0) return;
  const neto = Math.round(total / currentProvIva);
  const iva  = Math.round(total - neto);
  document.getElementById('mNeto').value = neto;
  document.getElementById('mIva').value  = iva;
}
