// Pruebas de las reglas de seguridad de Firestore.
// Se corren contra el emulador:  npm test   (necesita Java y firebase-tools)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';

let env;
const T1 = 'empresa1', T2 = 'empresa2';
const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const d = (uid, ...p) => doc(db(uid), ...p);
const t1 = (uid, ...p) => doc(db(uid), 'tenants', T1, ...p);
const pago = (extra = {}) => ({ prestamoId: 'p1', clienteId: 'c1', rutaId: 'k1', cobradorId: 'k1', fecha: '2026-09-28', hora: '10:00', monto: 13500, tipo: 'cuota', n: 'CR-0928-01', creadoPor: 'cob1', anulado: false, ts: serverTimestamp(), ...extra });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cartera', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore(), s = (p, v) => setDoc(doc(f, ...p.split('/')), v);
    await s(`tenants/${T1}`, { nombre: 'Uno', owner: 'admin1', codigo: 'AAA111', estado: 'activa', creado: Timestamp.now(), config: { empresa: 'Uno' }, plan: { nombre: 'Prueba', maxCobradores: 2, maxPrestamos: 50 } });
    await s('tenants/susp', { nombre: 'Suspendida', owner: 'admin3', codigo: 'SSS333', estado: 'suspendida', creado: Timestamp.now(), config: {} });
    await s('tenants/vencida', { nombre: 'Vencida', owner: 'admin4', codigo: 'VVV444', estado: 'prueba', creado: Timestamp.fromMillis(Date.now() - 40 * 86400000), config: {} });
    await s('tenants/extendida', { nombre: 'Extendida', owner: 'admin5', codigo: 'EEE555', estado: 'prueba', creado: Timestamp.fromMillis(Date.now() - 40 * 86400000), pruebaHasta: Timestamp.fromMillis(Date.now() + 5 * 86400000), config: {} });
    await s('users/admin3', { tenantId: 'susp', rol: 'admin', activo: true });
    await s('users/admin4', { tenantId: 'vencida', rol: 'admin', activo: true });
    await s('users/admin5', { tenantId: 'extendida', rol: 'admin', activo: true });
    await s('tenants/susp/prestamos/px', { clienteId: 'c1', cobradorId: 'k1', monto: 1 });
    await s('tenants/vencida/prestamos/px', { clienteId: 'c1', cobradorId: 'k1', monto: 1 });
    await s('tenants/extendida/prestamos/px', { clienteId: 'c1', cobradorId: 'k1', monto: 1 });
    await s('superadmins/jefe', { nombre: 'Dueño de la plataforma' });
    await s(`tenants/${T2}`, { nombre: 'Dos', owner: 'admin2', codigo: 'BBB222', config: { empresa: 'Dos' }, plan: { nombre: 'Prueba' } });
    await s('codigos/AAA111', { tenantId: T1 });
    await s('users/admin1', { tenantId: T1, rol: 'admin', activo: true, nombre: 'Admin uno' });
    await s('users/admin2', { tenantId: T2, rol: 'admin', activo: true, nombre: 'Admin dos' });
    await s('users/cob1', { tenantId: T1, rol: 'cobrador', cobradorId: 'k1', activo: true });
    await s('users/cob2', { tenantId: T1, rol: 'cobrador', cobradorId: 'k2', activo: true });
    await s('users/cli1', { tenantId: T1, rol: 'cliente', clienteId: 'c1', activo: true });
    await s('users/viejo', { tenantId: T1, rol: 'cobrador', cobradorId: 'k1', activo: false });
    await s(`tenants/${T1}/cobradores/k1`, { nombre: 'Carlos' });
    await s(`tenants/${T1}/clientes/c1`, { nombre: 'Rosa', cobradorId: 'k1' });
    await s(`tenants/${T1}/clientes/c2`, { nombre: 'Luis', cobradorId: 'k2' });
    await s(`tenants/${T1}/prestamos/p1`, { clienteId: 'c1', cobradorId: 'k1', monto: 400000 });
    await s(`tenants/${T1}/prestamos/p2`, { clienteId: 'c2', cobradorId: 'k2', monto: 300000 });
    await s(`tenants/${T1}/pagos/g1`, { ...pago(), ts: Timestamp.now() });
    await s(`tenants/${T1}/pagos/gViejo`, { ...pago(), ts: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000) });
    await s(`tenants/${T1}/pagos/g2`, { ...pago({ prestamoId: 'p2', clienteId: 'c2', rutaId: 'k2', cobradorId: 'k2', creadoPor: 'cob2' }), ts: Timestamp.now() });
    await s(`tenants/${T1}/bitacora/b1`, { accion: 'x', uid: 'admin1' });
  });
});

describe('Registro de empresa', () => {
  it('un usuario nuevo crea su empresa, su código y su perfil de administrador', async () => {
    const f = db('nuevo'), b = writeBatch(f);
    b.set(doc(f, 'tenants', 'T3'), { nombre: 'Tres', owner: 'nuevo', codigo: 'CCC333', estado: 'prueba', creado: serverTimestamp(), config: {}, plan: { nombre: 'Prueba', maxCobradores: 2, maxPrestamos: 50 } });
    b.set(doc(f, 'codigos', 'CCC333'), { tenantId: 'T3' });
    b.set(doc(f, 'users', 'nuevo'), { tenantId: 'T3', rol: 'admin', activo: true });
    await assertSucceeds(b.commit());
  });
  it('una empresa nueva no puede nacer activa, con otro plan ni con prueba extendida', async () => {
    const intento = async (extra) => {
      const f = db('nuevo'), b = writeBatch(f);
      b.set(doc(f, 'tenants', 'T6'), { nombre: 'Seis', owner: 'nuevo', codigo: 'FFF666', estado: 'prueba', creado: serverTimestamp(), config: {}, plan: { nombre: 'Prueba', maxCobradores: 2, maxPrestamos: 50 }, ...extra });
      b.set(doc(f, 'codigos', 'FFF666'), { tenantId: 'T6' });
      b.set(doc(f, 'users', 'nuevo'), { tenantId: 'T6', rol: 'admin', activo: true });
      return b.commit();
    };
    await assertFails(intento({ estado: 'activa' }));
    await assertFails(intento({ plan: { nombre: 'Empresa', maxCobradores: 0, maxPrestamos: 0 } }));
    await assertFails(intento({ pruebaHasta: Timestamp.fromMillis(Date.now() + 365 * 86400000) }));
  });
  it('nadie se vuelve administrador de una empresa que ya existe', async () => {
    await assertFails(setDoc(d('intruso', 'users', 'intruso'), { tenantId: T1, rol: 'admin', activo: true }));
  });
  it('quien ya pertenece a una empresa no puede crear otra', async () => {
    const f = db('cob1'), b = writeBatch(f);
    b.set(doc(f, 'tenants', 'T4'), { nombre: 'Cuatro', owner: 'cob1', codigo: 'DDD444' });
    await assertFails(b.commit());
  });
  it('no se puede reutilizar un código de empresa', async () => {
    await assertFails(setDoc(d('nuevo', 'codigos', 'AAA111'), { tenantId: 'T5' }));
  });
});

describe('Aislamiento entre empresas', () => {
  it('sin sesión no se lee nada', async () => { await assertFails(getDoc(t1(null))); });
  it('el admin de otra empresa no ve la empresa ni sus clientes', async () => {
    await assertFails(getDoc(t1('admin2')));
    await assertFails(getDocs(collection(db('admin2'), 'tenants', T1, 'clientes')));
  });
  it('un acceso desactivado no entra', async () => { await assertFails(getDoc(t1('viejo'))); });
});

describe('Administración', () => {
  it('lee todos los clientes y préstamos de su empresa', async () => {
    await assertSucceeds(getDocs(collection(db('admin1'), 'tenants', T1, 'clientes')));
    await assertSucceeds(getDocs(collection(db('admin1'), 'tenants', T1, 'prestamos')));
  });
  it('cambia la configuración', async () => { await assertSucceeds(updateDoc(t1('admin1'), { config: { empresa: 'Nuevo nombre' } })); });
  it('no puede cambiar su plan, su estado, su prueba ni el código', async () => {
    await assertFails(updateDoc(t1('admin1'), { plan: { nombre: 'Empresa', maxCobradores: 0 } }));
    await assertFails(updateDoc(t1('admin1'), { codigo: 'ZZZ999' }));
    await assertFails(updateDoc(d('admin4', 'tenants', 'vencida'), { estado: 'activa' }));
    await assertFails(updateDoc(d('admin4', 'tenants', 'vencida'), { pruebaHasta: Timestamp.fromMillis(Date.now() + 86400000) }));
  });
  it('crea el acceso de un cobrador nuevo', async () => {
    await assertSucceeds(setDoc(d('admin1', 'users', 'cob3'), { tenantId: T1, rol: 'cobrador', cobradorId: 'k3', activo: true }));
  });
  it('no puede apropiarse del usuario de otra empresa', async () => {
    await assertFails(setDoc(d('admin1', 'users', 'admin2'), { tenantId: T1, rol: 'cobrador', activo: true }));
  });
  it('no puede editar su propio perfil', async () => { await assertFails(updateDoc(d('admin1', 'users', 'admin1'), { rol: 'cliente' })); });
  it('desactiva el acceso de un cobrador', async () => { await assertSucceeds(updateDoc(d('admin1', 'users', 'cob2'), { activo: false })); });
  it('anula un pago, pero no puede cambiarle el valor ni borrarlo', async () => {
    await assertSucceeds(updateDoc(t1('admin1', 'pagos', 'g1'), { anulado: true, anuladoPor: 'admin1' }));
    await assertFails(updateDoc(t1('admin1', 'pagos', 'g2'), { monto: 1 }));
    await assertFails(deleteDoc(t1('admin1', 'pagos', 'g2')));
  });
  it('la bitácora no se puede borrar', async () => { await assertFails(deleteDoc(t1('admin1', 'bitacora', 'b1'))); });
});

describe('Cobrador', () => {
  const q = (uid, col, campo, valor) => getDocs(query(collection(db(uid), 'tenants', T1, col), where(campo, '==', valor)));
  it('ve los préstamos, clientes y pagos de su ruta', async () => {
    await assertSucceeds(q('cob1', 'prestamos', 'cobradorId', 'k1'));
    await assertSucceeds(q('cob1', 'clientes', 'cobradorId', 'k1'));
    await assertSucceeds(q('cob1', 'pagos', 'rutaId', 'k1'));
  });
  it('no ve la ruta de otro cobrador', async () => {
    await assertFails(getDocs(collection(db('cob1'), 'tenants', T1, 'prestamos')));
    await assertFails(getDoc(t1('cob1', 'prestamos', 'p2')));
    await assertFails(q('cob1', 'pagos', 'rutaId', 'k2'));
  });
  it('registra un pago de su ruta', async () => { await assertSucceeds(setDoc(t1('cob1', 'pagos', 'n1'), pago())); });
  it('no registra pagos de préstamos ajenos ni a nombre de otro', async () => {
    await assertFails(setDoc(t1('cob1', 'pagos', 'n2'), pago({ prestamoId: 'p2', clienteId: 'c2', rutaId: 'k2' })));
    await assertFails(setDoc(t1('cob1', 'pagos', 'n3'), pago({ cobradorId: 'k2' })));
    await assertFails(setDoc(t1('cob1', 'pagos', 'n4'), pago({ creadoPor: 'cob2' })));
  });
  it('no registra renovaciones, valores negativos ni pagos ya anulados', async () => {
    await assertFails(setDoc(t1('cob1', 'pagos', 'n5'), pago({ tipo: 'renovacion' })));
    await assertFails(setDoc(t1('cob1', 'pagos', 'n6'), pago({ monto: -5000 })));
    await assertFails(setDoc(t1('cob1', 'pagos', 'n7'), pago({ anulado: true })));
  });
  it('deshace su pago en los primeros 15 minutos, no después', async () => {
    await assertSucceeds(updateDoc(t1('cob1', 'pagos', 'g1'), { anulado: true, anuladoPor: 'cob1' }));
    await assertFails(updateDoc(t1('cob1', 'pagos', 'gViejo'), { anulado: true, anuladoPor: 'cob1' }));
  });
  it('no borra pagos, no presta y no cambia la configuración', async () => {
    await assertFails(deleteDoc(t1('cob1', 'pagos', 'g1')));
    await assertFails(setDoc(t1('cob1', 'prestamos', 'p9'), { clienteId: 'c1', cobradorId: 'k1', monto: 100000 }));
    await assertFails(updateDoc(t1('cob1'), { config: { limiteEA: 999 } }));
  });
  it('registra sus gastos, no los de otro', async () => {
    await assertSucceeds(setDoc(t1('cob1', 'gastos', 'x1'), { cobradorId: 'k1', monto: 8000, concepto: 'Gasolina' }));
    await assertFails(setDoc(t1('cob1', 'gastos', 'x2'), { cobradorId: 'k2', monto: 8000, concepto: 'Gasolina' }));
  });
  it('escribe en la bitácora con su usuario, pero no la lee', async () => {
    await assertSucceeds(setDoc(t1('cob1', 'bitacora', 'b2'), { accion: 'Pago', uid: 'cob1' }));
    await assertFails(setDoc(t1('cob1', 'bitacora', 'b3'), { accion: 'Falso', uid: 'admin1' }));
    await assertFails(getDoc(t1('cob1', 'bitacora', 'b1')));
  });
});

describe('Cliente', () => {
  const q = (col, campo, valor) => getDocs(query(collection(db('cli1'), 'tenants', T1, col), where(campo, '==', valor)));
  it('ve sus préstamos, sus pagos y su ficha', async () => {
    await assertSucceeds(q('prestamos', 'clienteId', 'c1'));
    await assertSucceeds(q('pagos', 'clienteId', 'c1'));
    await assertSucceeds(getDoc(t1('cli1', 'clientes', 'c1')));
  });
  it('no ve datos de otros clientes ni de los cobradores', async () => {
    await assertFails(getDocs(collection(db('cli1'), 'tenants', T1, 'prestamos')));
    await assertFails(getDoc(t1('cli1', 'clientes', 'c2')));
    await assertFails(q('pagos', 'rutaId', 'k1'));
    await assertFails(getDocs(collection(db('cli1'), 'tenants', T1, 'cobradores')));
  });
  it('pide un préstamo a su nombre', async () => {
    await assertSucceeds(setDoc(t1('cli1', 'solicitudes', 's1'), { clienteId: 'c1', monto: 300000, estado: 'pendiente' }));
  });
  it('no pide a nombre de otro ni se aprueba su propia solicitud', async () => {
    await assertFails(setDoc(t1('cli1', 'solicitudes', 's2'), { clienteId: 'c2', monto: 300000, estado: 'pendiente' }));
    await assertFails(setDoc(t1('cli1', 'solicitudes', 's3'), { clienteId: 'c1', monto: 300000, estado: 'aprobada' }));
  });
  it('no registra pagos', async () => { await assertFails(setDoc(t1('cli1', 'pagos', 'n8'), pago({ creadoPor: 'cli1' }))); });
});

describe('Plataforma (dueño)', () => {
  it('el dueño ve la lista de empresas; nadie más', async () => {
    await assertSucceeds(getDocs(collection(db('jefe'), 'tenants')));
    await assertFails(getDocs(collection(db('admin1'), 'tenants')));
  });
  it('el dueño activa, suspende, extiende la prueba y cambia el plan', async () => {
    await assertSucceeds(updateDoc(d('jefe', 'tenants', 'vencida'), { estado: 'activa' }));
    await assertSucceeds(updateDoc(d('jefe', 'tenants', T1), { estado: 'suspendida', notaPlataforma: 'No pagó' }));
    await assertSucceeds(updateDoc(d('jefe', 'tenants', 'susp'), { estado: 'prueba', pruebaHasta: Timestamp.fromMillis(Date.now() + 15 * 86400000) }));
    await assertSucceeds(updateDoc(d('jefe', 'tenants', 'extendida'), { plan: { nombre: 'Profesional', maxCobradores: 5, maxPrestamos: 300 } }));
  });
  it('el dueño no cambia la configuración de una empresa ni inventa estados', async () => {
    await assertFails(updateDoc(d('jefe', 'tenants', T1), { config: { limiteEA: 999 } }));
    await assertFails(updateDoc(d('jefe', 'tenants', T1), { estado: 'gratis-para-siempre' }));
  });
  it('el dueño cuenta préstamos y cobradores de una empresa, pero no ve pagos ni clientes', async () => {
    await assertSucceeds(getDocs(collection(db('jefe'), 'tenants', T1, 'prestamos')));
    await assertFails(getDocs(collection(db('jefe'), 'tenants', T1, 'clientes')));
    await assertFails(getDocs(collection(db('jefe'), 'tenants', T1, 'pagos')));
  });
  it('nadie se agrega como dueño de la plataforma', async () => {
    await assertFails(setDoc(d('admin1', 'superadmins', 'admin1'), { nombre: 'Yo' }));
  });
  it('una empresa suspendida ve su ficha, pero no sus datos', async () => {
    await assertSucceeds(getDoc(d('admin3', 'tenants', 'susp')));
    await assertFails(getDocs(collection(db('admin3'), 'tenants', 'susp', 'prestamos')));
  });
  it('con la prueba vencida no opera; con la prueba extendida sí', async () => {
    await assertFails(getDocs(collection(db('admin4'), 'tenants', 'vencida', 'prestamos')));
    await assertSucceeds(getDocs(collection(db('admin5'), 'tenants', 'extendida', 'prestamos')));
  });
});
