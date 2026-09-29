# Cartera Diaria · arquitectura

## Piezas

| Pieza | Qué hace |
|---|---|
| `index.html` | Página única con estilos y la estructura de la app |
| `js/app.js` | Interfaz de los tres perfiles, motor de préstamos (cuotas, tasa efectiva, mora), reportes y gráficas |
| `js/backend.js` | Capa de datos. Dos modos con las mismas funciones: Firebase y demostración |
| `js/config.js` | Datos del proyecto de Firebase, plan inicial y registro abierto |
| `sw.js` + `manifest.webmanifest` + `icons/` | PWA: instalable y abre sin internet |
| `firestore.rules` | Seguridad: quién lee y escribe qué |
| `tests/reglas.test.mjs` | 30 pruebas de las reglas contra el emulador |

Sin paso de compilación: se publica tal cual en GitHub Pages. El SDK de Firebase (v12.19.0) se carga desde gstatic.com.

## Multiempresa

Cada negocio que se registra es un *tenant*. Todo lo suyo vive debajo de `tenants/{empresa}`.
El perfil de cada usuario está en `users/{uid}` con su empresa y su rol. Las reglas leen ese perfil,
así que no hace falta Cloud Functions y todo funciona en el plan gratuito.

```
users/{uid}               tenantId, rol (admin | cobrador | cliente), cobradorId | clienteId, nombre, email, activo
codigos/{CODIGO}          tenantId          ← garantiza que el código de empresa no se repita
tenants/{empresa}         nombre, owner, codigo, plan{nombre,maxCobradores,maxPrestamos}, config{...}
  planes/{id}             nombre, metodo, tasa, frecuencia, cuotas, domingos
  cobradores/{id}         nombre, telefono, ruta, comision, comBase, codigo, email
  clientes/{id}           nombre, cedula, telefono, negocio, direccion, barrio, referencia, cobradorId, orden, app
  prestamos/{id}          numero, clienteId, cobradorId, cobradorNombre, condiciones del plan, monto, inicio,
                          cuota, fechas[], ea, descontado, renuevaDe, entregadoPor
  pagos/{id}              prestamoId, clienteId, rutaId, cobradorId, fecha, hora, monto, tipo (cuota | recargo | renovacion),
                          n (recibo), creadoPor, anulado, ts
  visitas/{id}            prestamoId, rutaId, fecha, hora, motivo       ← "no pagó"
  gastos/{id}  bases/{id}  solicitudes/{id}  bitacora/{id}
```

Decisiones:

- **El saldo no se guarda: se calcula** a partir de los pagos. Así un pago hecho sin señal nunca deja un saldo
  desactualizado ni choca con otro pago.
- **Los pagos nunca se borran.** Se anulan (queda quién y cuándo). El cobrador solo puede deshacer
  el suyo en los primeros 15 minutos; después, solo la oficina.
- `rutaId` en pagos y visitas es el cobrador dueño del préstamo, para que cada cobrador lea solo lo de su ruta.
  Al cambiar un préstamo de cobrador, se actualiza en el mismo lote.
- **Números de recibo sin internet:** iniciales de quien cobra + fecha + consecutivo del día en ese equipo
  (por ejemplo `CR-0928-07`). **Número de préstamo:** `P-` + fecha + 3 letras al azar.
- Los accesos de cobradores y clientes los crea la oficina con una sesión secundaria de Firebase,
  así no pierde su propia sesión. Los clientes entran con código + cédula + PIN, que por dentro se convierte en
  una cuenta `cedula.codigo@clientes.carteradiaria.app`.

## Qué ve cada perfil

| | Oficina | Cobrador | Cliente |
|---|---|---|---|
| Préstamos, pagos | Todos | Solo su ruta | Solo los suyos |
| Clientes | Todos | Los de su ruta | Su ficha |
| Registrar pagos | Sí | Sí, de su ruta | No |
| Prestar, renovar, anular | Sí | No | No |
| Gastos y bases | Todo | Los suyos | No |
| Solicitudes de préstamo | Aprueba o rechaza | No | Crea las suyas |
| Ajustes, tasas, bitácora | Sí | No | No |

## Sin internet

- Firestore guarda una copia local (IndexedDB) y deja en cola lo que se escribe sin señal; al volver la conexión
  lo envía en orden. La barra superior muestra "Sin conexión" y cuántos pagos faltan por enviar.
- El service worker guarda la app, el SDK y las fuentes, así que la app abre sin señal después de la primera vez.
- Crear accesos y crear empresa sí necesitan internet.
