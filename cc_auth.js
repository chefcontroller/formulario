// cc_auth.js — ChefController
// Login, logout, init de sesión y resolución de rol/local
// Depende de: cc_config.js, cc_utils.js

// ── Estado global de sesión ──────────────────────────────
// Estas variables son accedidas por todos los módulos via window.*
window.userRol    = 'cajero';
window.localId    = null;
window.localNombre = '';
window.localCodigo = '';

// ── Cliente Supabase (singleton) ─────────────────────────
const { createClient } = supabase;
const sb = createClient(CC_CONFIG.supabase.url, CC_CONFIG.supabase.anonKey);

// ── Arranque: verificar sesión existente ─────────────────
window.onload = async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await init();
};

// ── Login ────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  const btn   = document.getElementById('btnLogin');
  const err   = document.getElementById('lErr');

  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  err.classList.add('hidden');

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });

  if (error) {
    err.textContent = 'Email o contraseña incorrectos';
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
    return;
  }
  await init();
}

// ── Logout ───────────────────────────────────────────────
async function logout() {
  await sb.auth.signOut();
  location.reload();
}

// ── Init: resuelve rol y local del usuario logueado ──────
async function init() {
  const { data: { user } } = await sb.auth.getUser();

  // Buscar en tabla usuarios por email → obtiene rol y local vinculado
  const { data: usr } = await sb.from('usuarios')
    .select('*, usuario_local(local_id, locales(id, nombre, codigo))')
    .eq('email', user.email)
    .single();

  if (usr) {
    window.userRol = usr.rol;
    const ul = usr.usuario_local?.[0];
    if (ul?.locales) {
      window.localId     = ul.locales.id;
      window.localNombre = ul.locales.nombre;
      window.localCodigo = ul.locales.codigo;
    }
  }

  // Si no hay local asignado (admin sin vínculo), tomar el primero disponible
  if (!window.localId) {
    const { data: loc } = await sb.from('locales')
      .select('id, nombre, codigo')
      .limit(1)
      .single();
    if (loc) {
      window.localId     = loc.id;
      window.localNombre = loc.nombre;
      window.localCodigo = loc.codigo;
    }
  }

  // Actualizar UI con nombre del local
  document.getElementById('hLocal').textContent = window.localNombre;
  document.getElementById('dLocal').textContent = window.localNombre;

  // Configurar arqueo según rol:
  // cajero → arqueo ciego (solo ve efectivo real)
  // supervisor/dueno/admin → arqueo completo con desglose
  if (isSup()) {
    document.getElementById('arqCiego').classList.add('hidden');
    document.getElementById('arqCompleto').classList.remove('hidden');
  }

  // Mostrar botón de proveedores solo para supervisores+
  if (isSup()) {
    document.getElementById('btnProveedores').style.display = 'block';
  }

  // Activar campos de shopping si el local los requiere
  // if (window.localCodigo === 'CODIGO-SHOPPING') {
  //   document.querySelectorAll('.shopping-only').forEach(el => el.classList.remove('hidden'));
  // }

  // Cargar datos iniciales
  await loadProveedores(); // cc_proveedores.js
  await loadTurnos();      // cc_turnos.js

  show('sTurnos');
}
