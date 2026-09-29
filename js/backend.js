// ============================================================
//  Capa de datos de Cartera Diaria
//  - Modo Firebase: Auth + Firestore con caché local (funciona sin internet).
//  - Modo demostración: todo en memoria y en localStorage del navegador.
//  Las dos exponen las mismas funciones, así la interfaz no cambia.
// ============================================================
import { FIREBASE_CONFIG, SDK_VERSION, DOMINIO_CLIENTES, PLAN_INICIAL } from './config.js';

export const MODO_DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('PEGA');

const COLECCIONES = ['planes', 'cobradores', 'clientes', 'prestamos', 'pagos', 'visitas', 'gastos', 'bases', 'solicitudes', 'bitacora', 'usuarios'];
export const vacio = () => { const S = { config: null, tenant: null }; COLECCIONES.forEach(c => S[c] = []); return S; };

// Une pagos y visitas con su préstamo, para que la interfaz use l.pagos y l.novedades.
export function indexar(S) {
  const pb = {}, vb = {};
  for (const p of S.pagos) (pb[p.prestamoId] ??= []).push(p);
  for (const v of S.visitas) (vb[v.prestamoId] ??= []).push(v);
  for (const l of S.prestamos) { l.pagos = pb[l.id] || []; l.novedades = vb[l.id] || []; l.num = l.numero || l.id; }
}

const pad = n => String(n).padStart(2, '0');
export const ahora = () => { const d = new Date(); return { fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };
const aleatorio = (n, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => abc[x % abc.length]).join('');
export const numeroPrestamo = () => { const { fecha } = ahora(); return 'P-' + fecha.slice(2).replace(/-/g, '') + '-' + aleatorio(3); };

// Número de recibo: código de quien cobra + fecha + consecutivo del día en este equipo.
// Se puede generar sin internet y no choca entre cobradores.
export function numeroRecibo(codigo) {
  const { fecha } = ahora(), k = 'cd-recibo-' + codigo + '-' + fecha;
  let n = 0; try { n = Number(localStorage.getItem(k) || 0) + 1; localStorage.setItem(k, n); } catch (e) { n = Math.floor(Math.random() * 900) + 100; }
  return `${codigo}-${fecha.slice(5).replace('-', '')}-${pad(n)}`;
}
// Convierte fechas de Firestore (Timestamp), Date o texto a milisegundos.
export const ms = v => v == null ? null : typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : (v.seconds != null ? v.seconds * 1000 : null);
// ¿La empresa puede operar? Misma lógica que las reglas de seguridad.
export function estadoEmpresa(t, diasPrueba = 30) {
  if (!t) return { opera: true, estado: 'activa' };
  const estado = t.estado || 'activa';
  if (estado === 'activa') return { opera: true, estado };
  if (estado === 'suspendida') return { opera: false, estado };
  const hasta = ms(t.pruebaHasta) ?? ((ms(t.creado) ?? Date.now()) + diasPrueba * 864e5);
  const dias = Math.ceil((hasta - Date.now()) / 864e5);
  return dias > 0 ? { opera: true, estado: 'prueba', dias, hasta } : { opera: false, estado: 'vencida', dias: 0, hasta };
}
export const correoCliente = (cedula, codigo) => `${String(cedula).replace(/\D/g, '')}.${String(codigo).trim().toLowerCase()}@${DOMINIO_CLIENTES}`;

// ------------------------------------------------------------
//  Modo demostración
// ------------------------------------------------------------
export function backendDemo({ generar, onData, onAuth }) {
  const KEY = 'cartera-diaria-demo-v4';
  let S, EMP = null, empCb = null;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S) S = generar();
  const guardarLocal = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, prestamos: S.prestamos.map(({ pagos, novedades, num, ...r }) => r) })); } catch (e) { } };
  const emitir = () => { indexar(S); guardarLocal(); onData(S, { pendientes: 0 }); };
  const id = () => Math.random().toString(36).slice(2, 10);
  const B = {
    demo: true,
    uid: 'demo',
    me: { rol: 'admin', nombre: 'Administración', tenantId: 'demo', activo: true },
    guardarConfig(cfg) { S.config = cfg; S.tenant.config = cfg; emitir(); },
    guardar(col, docId, data) { if (docId) { const d = S[col].find(x => x.id === docId); Object.assign(d, data); } else { docId = id(); S[col].push({ id: docId, ...data }); } emitir(); return docId; },
    borrar(col, docId) { S[col] = S[col].filter(x => x.id !== docId); emitir(); },
    crearPrestamo(data, { pagoRenovacion, solicitudId } = {}) {
      const pid = id(); S.prestamos.push({ id: pid, ...data });
      if (pagoRenovacion) S.pagos.push({ id: id(), ...pagoRenovacion });
      if (solicitudId) { const s = S.solicitudes.find(x => x.id === solicitudId); if (s) s.estado = 'aprobada'; }
      emitir(); return pid;
    },
    pagar(pagos) { const out = pagos.map(p => ({ id: id(), ...p })); S.pagos.push(...out); emitir(); return out; },
    anular(p) { const x = S.pagos.find(y => y.id === p.id); if (x) x.anulado = true; emitir(); },
    visita(v) { S.visitas.push({ id: id(), ...v }); emitir(); },
    reasignar(prestamoIds, cobradorId, cobradorNombre) {
      S.prestamos.filter(l => prestamoIds.includes(l.id)).forEach(l => { l.cobradorId = cobradorId; l.cobradorNombre = cobradorNombre; });
      S.pagos.filter(p => prestamoIds.includes(p.prestamoId)).forEach(p => p.rutaId = cobradorId);
      S.visitas.filter(p => prestamoIds.includes(p.prestamoId)).forEach(p => p.rutaId = cobradorId);
      emitir();
    },
    log(accion, quien) { const { fecha, hora } = ahora(); S.bitacora.unshift({ id: id(), t: fecha + ' ' + hora, quien, accion, uid: 'demo' }); S.bitacora = S.bitacora.slice(0, 300); emitir(); },
    async crearAcceso() { throw new Error('Los accesos se crean cuando conectes la app a Firebase.'); },
    async desactivarAcceso() { throw new Error('Disponible cuando conectes la app a Firebase.'); },
    restablecer() { S = generar(); emitir(); },
    // Panel de plataforma de ejemplo
    esSuper: true,
    escucharEmpresas(cb) {
      const dia = 864e5, n = Date.now();
      if (!EMP) EMP = [
        { id: 'demo', ...S.tenant, estado: 'activa', creado: n - 60 * dia, ultimoAcceso: n, contacto: { nombre: 'Administración', email: 'oficina@ejemplo.co' }, plan: { nombre: 'Profesional', maxCobradores: 5, maxPrestamos: 300 } },
        { id: 'e2', nombre: 'Créditos El Progreso', codigo: 'K7M2PQ', estado: 'prueba', creado: n - 25 * dia, ultimoAcceso: n - dia, contacto: { nombre: 'Martha Gil', email: 'martha@elprogreso.co' }, plan: { nombre: 'Prueba', maxCobradores: 2, maxPrestamos: 50 }, uso: { prestamos: 38, cobradores: 2 } },
        { id: 'e3', nombre: 'Inversiones Doña Gloria', codigo: 'R3TX8W', estado: 'prueba', creado: n - 41 * dia, ultimoAcceso: n - 12 * dia, contacto: { nombre: 'Gloria Mejía', email: 'gloria@correo.co' }, plan: { nombre: 'Prueba', maxCobradores: 2, maxPrestamos: 50 }, uso: { prestamos: 12, cobradores: 1 } },
        { id: 'e4', nombre: 'Préstamos Rápidos del Sur', codigo: 'H9ZL4A', estado: 'suspendida', creado: n - 90 * dia, ultimoAcceso: n - 20 * dia, notaPlataforma: 'Dos meses sin pagar la suscripción', contacto: { nombre: 'Jairo Ramos', email: 'jairo@correo.co' }, plan: { nombre: 'Básico', maxCobradores: 2, maxPrestamos: 100 }, uso: { prestamos: 96, cobradores: 2 } },
        { id: 'e5', nombre: 'Fondo de Empleados Andino', codigo: 'P2WD6N', estado: 'activa', creado: n - 150 * dia, ultimoAcceso: n - 2 * 3600e3, contacto: { nombre: 'Luisa Parra', email: 'tesoreria@fondoandino.co' }, plan: { nombre: 'Empresa', maxCobradores: 0, maxPrestamos: 0 }, uso: { prestamos: 412, cobradores: 7 } }];
      empCb = cb; setTimeout(() => cb(EMP.map(e => ({ ...e }))), 0); return () => { empCb = null; };
    },
    async usoEmpresa(t) { const e = EMP.find(x => x.id === t); return e.uso || { prestamos: S.prestamos.length, cobradores: S.cobradores.length }; },
    async contactoEmpresa(e) { return e.contacto || null; },
    async actualizarEmpresa(t, cambios) {
      const e = EMP.find(x => x.id === t); Object.assign(e, cambios);
      if (t === 'demo') { Object.assign(S.tenant, cambios); emitir(); }
      if (empCb) empCb(EMP.map(x => ({ ...x })));
    },
    async salir() { }, async entrar() { }, async entrarCliente() { }, async registrarEmpresa() { }, async recuperar() { }
  };
  setTimeout(() => { onAuth({ me: B.me }); emitir(); }, 0);
  return B;
}

// ------------------------------------------------------------
//  Modo Firebase
// ------------------------------------------------------------
export async function backendFirebase({ onData, onAuth, onError, configInicial, planesIniciales }) {
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
  const [{ initializeApp, deleteApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);

  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });

  let S = vacio(), tid = null, me = null, unsubs = [], timer = null, pendientes = 0;
  const ref = (c, id) => F.doc(db, 'tenants', tid, c, id);
  const col = c => F.collection(db, 'tenants', tid, c);
  const nuevoId = c => F.doc(col(c)).id;
  const emitir = () => { clearTimeout(timer); timer = setTimeout(() => { indexar(S); onData(S, { pendientes }); }, 40); };
  // Las escrituras sin internet quedan en cola y se envían solas; no se espera la respuesta del servidor.
  const enviar = (promesa, que) => { promesa.catch(e => onError && onError(e, que)); };

  let datosUnsubs = [], datosActivos = false, accesoMarcado = false;
  function suscribir() {
    unsubs.forEach(u => u()); unsubs = []; S = vacio();
    datosUnsubs.forEach(u => u()); datosUnsubs = []; datosActivos = false; accesoMarcado = false;
    unsubs.push(F.onSnapshot(F.doc(db, 'tenants', tid), d => {
      S.tenant = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }; S.config = S.tenant.config;
      const opera = estadoEmpresa(S.tenant).opera;
      if (opera && !datosActivos) suscribirDatos();
      if (!opera && datosActivos) { datosUnsubs.forEach(u => u()); datosUnsubs = []; datosActivos = false; COLECCIONES.forEach(c => S[c] = []); }
      if (opera && me.rol === 'admin' && !accesoMarcado && navigator.onLine) { accesoMarcado = true; F.updateDoc(F.doc(db, 'tenants', tid), { ultimoAcceso: F.serverTimestamp() }).catch(() => { }); }
      emitir();
    }, e => onError && onError(e, 'leer empresa')));
  }
  function suscribirDatos() {
    datosActivos = true;
    const unsubs = datosUnsubs;
    const escuchar = (clave, q) => unsubs.push(F.onSnapshot(q, { includeMetadataChanges: clave === 'pagos' }, snap => {
      S[clave] = snap.docs.map(d => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
      if (clave === 'pagos') pendientes = snap.docs.filter(d => d.metadata.hasPendingWrites).length;
      emitir();
    }, e => onError && onError(e, 'leer ' + clave)));
    const W = (c, campo, valor) => F.query(col(c), F.where(campo, '==', valor));
    escuchar('planes', col('planes'));
    if (me.rol === 'admin') {
      ['cobradores', 'clientes', 'prestamos', 'pagos', 'visitas', 'gastos', 'bases', 'solicitudes'].forEach(c => escuchar(c, col(c)));
      escuchar('bitacora', F.query(col('bitacora'), F.orderBy('ts', 'desc'), F.limit(300)));
      escuchar('usuarios', F.query(F.collection(db, 'users'), F.where('tenantId', '==', tid)));
    } else if (me.rol === 'cobrador') {
      const k = me.cobradorId;
      escuchar('cobradores', col('cobradores'));
      escuchar('clientes', W('clientes', 'cobradorId', k));
      escuchar('prestamos', W('prestamos', 'cobradorId', k));
      escuchar('pagos', W('pagos', 'rutaId', k));
      escuchar('visitas', W('visitas', 'rutaId', k));
      escuchar('gastos', W('gastos', 'cobradorId', k));
      escuchar('bases', W('bases', 'cobradorId', k));
    } else {
      const c = me.clienteId;
      unsubs.push(F.onSnapshot(ref('clientes', c), d => { S.clientes = d.exists() ? [{ ...d.data(), id: d.id }] : []; emitir(); }));
      escuchar('prestamos', W('prestamos', 'clienteId', c));
      escuchar('pagos', W('pagos', 'clienteId', c));
      escuchar('solicitudes', W('solicitudes', 'clienteId', c));
    }
  }

  let turno = 0;
  async function cargarPerfil(user) {
    const mio = ++turno; // si llega una respuesta vieja, se ignora
    unsubs.forEach(u => u()); unsubs = []; datosUnsubs.forEach(u => u()); datosUnsubs = []; datosActivos = false; me = null; tid = null;
    B.esSuper = false; B.uid = user ? user.uid : null;
    if (!user) { onAuth(null); return; }
    try { B.esSuper = (await F.getDoc(F.doc(db, 'superadmins', user.uid))).exists(); } catch (e) { B.esSuper = false; }
    let snap = null;
    try { snap = await F.getDoc(F.doc(db, 'users', user.uid)); } catch (e) { try { snap = await F.getDocFromCache(F.doc(db, 'users', user.uid)); } catch (e2) { } }
    if (mio !== turno) return;
    if (!snap || !snap.exists()) { onAuth({ user, me: null, super: B.esSuper }); return; }
    me = snap.data();
    if (!me.activo) { onAuth({ user, me, inactivo: true }); return; }
    tid = me.tenantId; B.uid = user.uid; B.me = me;
    suscribir();
    onAuth({ user, me, super: B.esSuper });
  }
  A.onAuthStateChanged(auth, cargarPerfil);

  window.addEventListener('online', emitir); window.addEventListener('offline', emitir);

  const B = {
    demo: false, uid: null, me: null,
    // ---- Ingreso ----
    entrar: (correo, clave) => A.signInWithEmailAndPassword(auth, correo.trim(), clave),
    entrarCliente: (codigo, cedula, pin) => A.signInWithEmailAndPassword(auth, correoCliente(cedula, codigo), pin),
    recuperar: correo => A.sendPasswordResetEmail(auth, correo.trim()),
    salir: () => A.signOut(auth),
    async registrarEmpresa({ empresa, nombre, correo, clave }) {
      // Si ya inició sesión pero su cuenta quedó sin empresa, se reutiliza esa cuenta.
      const user = auth.currentUser || (await A.createUserWithEmailAndPassword(auth, correo.trim(), clave)).user;
      const uid = user.uid;
      for (let intento = 0; intento < 5; intento++) {
        const t = F.doc(F.collection(db, 'tenants')).id, codigo = aleatorio(6);
        const lote = F.writeBatch(db);
        lote.set(F.doc(db, 'tenants', t), { nombre: empresa, owner: uid, codigo, estado: 'prueba', creado: F.serverTimestamp(), contacto: { nombre, email: user.email || correo.trim() }, config: { ...configInicial, empresa }, plan: PLAN_INICIAL });
        lote.set(F.doc(db, 'codigos', codigo), { tenantId: t });
        lote.set(F.doc(db, 'users', uid), { tenantId: t, rol: 'admin', nombre, email: correo.trim(), activo: true });
        try { await lote.commit(); } catch (e) { if (intento < 4 && /permission|exists/i.test(e.message)) continue; throw e; }
        const lote2 = F.writeBatch(db);
        planesIniciales.forEach(p => lote2.set(F.doc(F.collection(db, 'tenants', t, 'planes')), p));
        lote2.set(F.doc(F.collection(db, 'tenants', t, 'bitacora')), { t: ahora().fecha + ' ' + ahora().hora, quien: nombre, accion: `Creó la empresa ${empresa}`, uid, ts: F.serverTimestamp() });
        await lote2.commit();
        await cargarPerfil(user);
        return;
      }
    },
    // ---- Datos ----
    guardarConfig(cfg) { enviar(F.updateDoc(F.doc(db, 'tenants', tid), { config: cfg, nombre: cfg.empresa }), 'guardar ajustes'); },
    guardar(c, id, data) {
      if (id) { enviar(F.setDoc(ref(c, id), data, { merge: true }), 'guardar ' + c); return id; }
      const nid = nuevoId(c); enviar(F.setDoc(ref(c, nid), { ...data, ts: F.serverTimestamp() }), 'guardar ' + c); return nid;
    },
    borrar(c, id) { enviar(F.deleteDoc(ref(c, id)), 'borrar ' + c); },
    crearPrestamo(data, { pagoRenovacion, solicitudId } = {}) {
      const lote = F.writeBatch(db), pid = nuevoId('prestamos');
      lote.set(ref('prestamos', pid), { ...data, ts: F.serverTimestamp() });
      if (pagoRenovacion) lote.set(ref('pagos', nuevoId('pagos')), { ...pagoRenovacion, creadoPor: B.uid, anulado: false, ts: F.serverTimestamp() });
      if (solicitudId) lote.update(ref('solicitudes', solicitudId), { estado: 'aprobada', prestamoId: pid });
      enviar(lote.commit(), 'registrar préstamo'); return pid;
    },
    pagar(pagos) {
      const lote = F.writeBatch(db), out = [];
      pagos.forEach(p => { const id = nuevoId('pagos'), d = { ...p, creadoPor: B.uid, anulado: false, ts: F.serverTimestamp() }; lote.set(ref('pagos', id), d); out.push({ id, ...d }); });
      enviar(lote.commit(), 'registrar pago'); return out;
    },
    anular(p) { enviar(F.updateDoc(ref('pagos', p.id), { anulado: true, anuladoPor: B.uid, anuladoEn: F.serverTimestamp() }), 'anular pago'); },
    visita(v) { enviar(F.setDoc(ref('visitas', nuevoId('visitas')), { ...v, creadoPor: B.uid, ts: F.serverTimestamp() }), 'registrar visita'); },
    reasignar(prestamoIds, cobradorId, cobradorNombre) {
      const lote = F.writeBatch(db);
      prestamoIds.forEach(id => lote.update(ref('prestamos', id), { cobradorId, cobradorNombre }));
      S.pagos.filter(p => prestamoIds.includes(p.prestamoId)).forEach(p => lote.update(ref('pagos', p.id), { rutaId: cobradorId }));
      S.visitas.filter(p => prestamoIds.includes(p.prestamoId)).forEach(p => lote.update(ref('visitas', p.id), { rutaId: cobradorId }));
      enviar(lote.commit(), 'cambiar de cobrador');
    },
    log(accion, quien) { const { fecha, hora } = ahora(); enviar(F.setDoc(ref('bitacora', nuevoId('bitacora')), { t: fecha + ' ' + hora, quien, accion, uid: B.uid, ts: F.serverTimestamp() }), 'bitácora'); },
    // ---- Accesos de cobradores y clientes ----
    // Se crean con una "app secundaria" para que el administrador no pierda su sesión.
    async crearAcceso({ correo, clave, rol, cobradorId = null, clienteId = null, nombre }) {
      if (!navigator.onLine) throw new Error('Necesitas internet para crear accesos.');
      const sec = initializeApp(FIREBASE_CONFIG, 'accesos-' + Date.now());
      try {
        const sa = A.getAuth(sec);
        const cred = await A.createUserWithEmailAndPassword(sa, correo, clave);
        await F.setDoc(F.doc(db, 'users', cred.user.uid), { tenantId: tid, rol, cobradorId, clienteId, nombre, email: correo, activo: true });
        await A.signOut(sa);
        return cred.user.uid;
      } finally { await deleteApp(sec); }
    },
    // ---- Plataforma (solo el dueño) ----
    esSuper: false,
    escucharEmpresas(cb) {
      return F.onSnapshot(F.collection(db, 'tenants'), snap => cb(snap.docs.map(d => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))), e => onError && onError(e, 'leer empresas'));
    },
    async usoEmpresa(t) {
      const n = async c => (await F.getCountFromServer(F.collection(db, 'tenants', t, c))).data().count;
      const [prestamos, cobradores] = await Promise.all([n('prestamos'), n('cobradores')]);
      return { prestamos, cobradores };
    },
    async contactoEmpresa(e) {
      if (e.contacto) return e.contacto;
      const u = await F.getDoc(F.doc(db, 'users', e.owner)); return u.exists() ? { nombre: u.data().nombre, email: u.data().email } : null;
    },
    async actualizarEmpresa(t, cambios) {
      const c = { ...cambios };
      if (c.pruebaHasta != null) c.pruebaHasta = F.Timestamp.fromMillis(c.pruebaHasta);
      await F.updateDoc(F.doc(db, 'tenants', t), c);
    },
    async desactivarAcceso(uid) { await F.updateDoc(F.doc(db, 'users', uid), { activo: false }); },
    restablecer() { }
  };
  return B;
}
