# Cartera Diaria · guía de instalación

App de control de préstamos diarios con tres perfiles: **oficina**, **cobrador** y **cliente**.
Es una PWA (se instala en el celular como una app) que guarda los datos en Firebase y
sigue funcionando sin señal: los pagos que registra el cobrador se envían solos cuando vuelve el internet.

Mientras `js/config.js` no tenga los datos de Firebase, la app abre en **modo demostración**
con clientes y préstamos de ejemplo guardados solo en el navegador.

---

## 1. Crear el proyecto de Firebase (plan gratuito Spark, sin tarjeta)

Usa un proyecto nuevo, aparte del de HVAC 360.

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** → nombre: `cartera-diaria`.
   Puedes desactivar Google Analytics.
2. **Authentication** → Comenzar → pestaña *Método de acceso* → activa **Correo electrónico/contraseña**.
3. **Firestore Database** → Crear base de datos → edición **Standard** → ubicación **us-east1**
   (queda cerca de Colombia; no se puede cambiar después) → modo de producción.
4. **Configuración del proyecto** (ícono de engranaje) → *Tus apps* → ícono web `</>` → registra la app
   con el nombre `Cartera Diaria` (sin Hosting). Copia el bloque `firebaseConfig`.
5. Abre `js/config.js` y pega esos valores en `FIREBASE_CONFIG`, en lugar de `"PEGA_AQUI"`.

## 2. Publicar las reglas de seguridad

Las reglas deciden quién ve qué. Sin ellas, la base de datos queda cerrada y la app no funciona.

**Opción fácil (consola):** Firestore Database → pestaña **Reglas** → borra lo que haya, pega todo el
contenido de `firestore.rules` → **Publicar**.

**Opción con terminal:** en `.firebaserc` pon el ID de tu proyecto y ejecuta:

```bash
npm install
npx firebase login
npm run publicar-reglas
```

## 3. Publicar la app en GitHub Pages

1. En GitHub crea un repositorio nuevo, por ejemplo `cartera-diaria`.
2. Sube **todos** los archivos de esta carpeta (menos `node_modules`).
3. En el repositorio: **Settings → Pages** → *Source*: `Deploy from a branch` → rama `main`, carpeta `/ (root)` → Save.
4. En uno o dos minutos queda en `https://joseonates.github.io/cartera-diaria/`.

## 4. Primer uso

1. Abre la dirección y toca **Crear empresa**. Esa cuenta queda como administrador (oficina).
2. En **Intereses y ajustes** revisa el límite de tasa, la usura del mes y los planes de préstamo.
   Ahí también está el **código de la empresa**, que usan los clientes para entrar.
3. En **Cobradores**, crea cada cobrador y dentro de su ficha toca **Crear acceso** (correo + contraseña inicial).
4. En **Clientes**, crea el cliente (con cédula) y dentro de su ficha toca **Activar app del cliente** (PIN de 6 números).

| Quién | Cómo entra | Qué ve |
|---|---|---|
| Oficina | Correo y contraseña | Todo: préstamos, caja, reportes, ajustes, bitácora |
| Cobrador | Correo y contraseña | Su ruta del día, sus clientes y su cuadre. Funciona sin señal |
| Cliente | Código de la empresa + cédula + PIN | Su saldo, su tarjeta, sus recibos y solicitudes |

## 5. Instalar en el celular

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar app** (o el botón *Instalar app* de la barra superior).
- **iPhone (Safari):** botón Compartir → **Agregar a pantalla de inicio**.

La primera vez hay que abrirla con internet. Después abre y funciona sin señal.

## 6. Panel de plataforma: controlar las empresas que se registran

Cada empresa que se registra arranca **en prueba por 30 días**, con el plan *Prueba* (2 cobradores y 50 préstamos
activos). Tú, como dueño de la app, la activas, la suspendes, le extiendes la prueba o le cambias el plan
desde el **Panel de plataforma**.

**Darte acceso al panel (una sola vez):**

1. Firebase → **Authentication** → pestaña *Usuarios* → copia el **UID** de tu cuenta (tu correo).
2. **Firestore Database** → *Iniciar colección* → ID de la colección: `superadmins` →
   ID del documento: **pega tu UID** → campo `nombre` (string) = tu nombre → Guardar.
3. Sal de la app y vuelve a entrar: aparece el botón **Plataforma** arriba a la derecha.

**Qué puedes hacer en el panel:**

| Acción | Qué pasa |
|---|---|
| Activar | La empresa trabaja sin límite de tiempo (según su plan) |
| Suspender | La oficina, sus cobradores y sus clientes ven un aviso con tus datos de contacto y no pueden trabajar. No se borra nada |
| +7 / +15 / +30 días | Deja la empresa en prueba y corre la fecha de vencimiento |
| Aplicar plan | Cambia el límite de cobradores y de préstamos activos |
| Nota interna | Un apunte que solo tú ves (pagos, acuerdos) |

Cuando la prueba vence, la empresa queda bloqueada igual que si estuviera suspendida, hasta que la actives
o le extiendas la prueba. Esto lo hacen cumplir las reglas de Firestore, no solo la pantalla.

Los planes, sus precios y tus datos de contacto se cambian en `js/config.js` (`PLANES_SUSCRIPCION` y `SOPORTE`).
Por privacidad, desde el panel ves cuántos cobradores y préstamos tiene cada empresa, pero no sus clientes ni sus pagos.

Si solo vas a usar la app para tu negocio, pon `REGISTRO_ABIERTO = false` en `js/config.js`.

## 7. Probar las reglas de seguridad (opcional, recomendado)

Necesitas Node 20+ y Java 21+. En esta carpeta:

```bash
npm install
npm test
```

Corre 38 pruebas contra el emulador de Firestore: aislamiento entre empresas, qué puede hacer cada rol,
que los pagos no se borren, que el cobrador solo deshaga un pago en los primeros 15 minutos, que una empresa
suspendida o con la prueba vencida no opere y que solo el dueño de la plataforma cambie estados y planes.

## 8. Cuánto aguanta el plan gratuito

El plan Spark permite 50.000 lecturas y 20.000 escrituras al día. Cada pago o préstamo guardado cuenta como
una lectura cuando alguien abre la app después de un rato sin usarla (la oficina lee todo; el cobrador y el
cliente, solo lo suyo). Con unos pocos miles de pagos guardados y la oficina entrando varias veces al día,
el plan gratuito alcanza. Cuando el historial crezca mucho, el siguiente paso es archivar los préstamos pagados.

## 9. Lo que queda para cuando pases al plan Blaze

- Cambiar el PIN de un cliente que lo olvidó (hoy hay que desactivar su app).
- Hacer cumplir los límites de cobradores y préstamos del plan desde el servidor (hoy los controla la app).
- Cobrar la suscripción automáticamente (Wompi, Bold o Mercado Pago).
- Fotos (cédula, negocio) y firma del cliente en el pagaré, que requieren Storage.
