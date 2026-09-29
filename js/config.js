// ============================================================
//  Configuración de Cartera Diaria
// ============================================================
// 1. Crea un proyecto en https://console.firebase.google.com
// 2. Agrega una app web y copia aquí los datos de "firebaseConfig".
// Mientras apiKey diga "PEGA_AQUI", la app funciona en MODO DEMOSTRACIÓN
// con datos de ejemplo guardados solo en el navegador.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDvG5EMDl-9YOO5tofmfH-g9yCVrr4lJAs",
  authDomain: "cartera-diaria-fa689.firebaseapp.com",
  projectId: "cartera-diaria-fa689",
  storageBucket: "cartera-diaria-fa689.firebasestorage.app",
  messagingSenderId: "279214989810",
  appId: "1:279214989810:web:d7b867099c7f9bd4874b6b"
};

// Versión del SDK de Firebase que se carga desde gstatic.com
export const SDK_VERSION = "12.19.0";

// Dominio interno para las cuentas de los clientes (entran con cédula + PIN).
// No tiene que existir: solo se usa para formar el "correo" de la cuenta.
export const DOMINIO_CLIENTES = "clientes.carteradiaria.app";

// Datos del plan con que arranca cada empresa nueva (tú lo cambias desde la consola de Firebase).
export const PLAN_INICIAL = { nombre: "Prueba", maxCobradores: 2, maxPrestamos: 50 };

// ¿Cualquier persona puede crear su empresa desde la pantalla de ingreso?
// Déjalo en true para vender la app como servicio; ponlo en false si solo la usará tu negocio.
export const REGISTRO_ABIERTO = true;
