# Slice — Mi Bóveda Financiera Personal (PWA)

**Slice** es una aplicación personal de control de mis finanzas, diseñada y adaptada específicamente a mis necesidades diarias: el flujo real de mi efectivo y cuentas de débito, las fechas exactas de corte y límite de pago de mis tarjetas de crédito, el seguimiento puntual de mis compras a Meses Sin Intereses (MSI), mis gastos fijos mensuales y los préstamos personales por cobrar (*"Me deben"*).

Desplegada como Progressive Web App (PWA) *mobile-first* en **[https://angelgcastillocode.github.io/slice/](https://angelgcastillocode.github.io/slice/)** para usarse directamente desde mi iPhone.

---

## Propósito y enfoque personal

Las apps comerciales de finanzas suelen estar llenas de funciones genéricas, publicidad o modelos contables que no reflejan cómo manejo mi dinero en el día a día. **Slice** nació como mi bóveda financiera personal hecha a la medida para resolver exactamente mi flujo en **MXN**:

- Saber en segundos cuál es mi **Liquidez Libre del Mes** real (mi efectivo y débito menos los estados de cuenta exigibles y gastos fijos pendientes), sin mezclar dinero disponible con deuda futura.
- Controlar mis tarjetas de crédito con sus reglas reales de corte y vencimiento (incluso cuando un mes tiene 28, 29 o 30 días, o cuando una compra se difiere al siguiente corte).
- Mantener visibilidad exacta de cada parcialidad activa de **MSI** y cuánto falta por liquidar sin depender de hojas de cálculo manuales.
- Registrar cualquier movimiento en menos de 10 segundos desde el iPhone con una interfaz limpia, privada y sin fricción.

---

## Funcionalidades clave

- **Control de liquidez real y Arqueo Rápido (*"Cuadrar Saldo"*):** Seguimiento simultáneo de cuentas de efectivo físico y débito/billeteras digitales, con ajuste automático por diferencia (`balance_adjustment`) para mantener el saldo del sistema siempre cuadrado con la realidad.
- **Tarjetas de crédito por ciclo de corte y fecha límite:** Cálculo automático del ciclo abierto, ciclo cerrado exigible, días restantes al corte, fecha límite de pago (mismo mes o mes siguiente según `cutoff_day` y `payment_due_day`) y soporte para diferir cargos en tránsito al siguiente corte.
- **Motor de Meses Sin Intereses (MSI):** Proyección de parcialidades en centavos enteros con asignación determinista del remanente de centavos, soporte de *backfill* (`start_installment = X de N`) para compras ya en curso y ajuste manual por parcialidad para cuadrar centavos exactos con el banco.
- **Control de gastos fijos recurrentes:** Registro mensual de suscripciones y pagos periódicos con interruptor rápido de estado (`pending` ↔ `paid`) sin doble conteo en estados de cuenta ni liquidez.
- **Préstamos por cobrar (*"Me deben"*):** Control de préstamos otorgados a terceros con seguimiento de saldo pendiente, abonos parciales y liquidación total.
- **Sesión persistente, correo recordado y Llavero de iCloud / Face ID:** Autenticación privada con Supabase Auth (`persistSession`, `autoRefreshToken`), checkbox **"Recordar sesión y correo"** que conserva el correo prellenado incluso tras cerrar sesión y formulario optimizado para autocompletado nativo con **Llavero de iCloud / Face ID** en iOS Safari.
- **PWA instalable y funcionamiento offline:** App Shell cacheado mediante Service Worker (`sw.js`) con estrategia *Network-First* y respaldo en caché local (*Stale-While-Revalidate*).

---

## Arquitectura y Stack

| Capa | Tecnología / Diseño |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 y **Vanilla JavaScript (ES Modules)** sin *bundlers* ni dependencias de compilación. |
| **Diseño UI** | Sistema visual **iOS Liquid Glass Monochromatic** (fondo OLED `#000000`, transparencias translúcidas con bordes especulares, tipografía `Inter` + `tabular-nums`, sin librerías externas). |
| **Motor Contable** | Módulos puros en JavaScript que operan estrictamente en **centavos enteros (`BIGINT`)** para evitar errores de punto flotante IEEE-754. |
| **Backend & Auth** | **Supabase** (Supabase Auth + PostgreSQL 17 vía PostgREST) protegido con políticas estrictas de **Row Level Security (RLS)** para usuario único. |
| **Offline & PWA** | `manifest.json` + Service Worker (`sw.js`) con `self.skipWaiting()`, `self.clients.claim()` y caché versionado (`slice-shell-v3`). |

---

## Estructura del proyecto

```text
slice/
├── index.html                  # App Shell, pantalla de login (#auth-screen) y vistas principales
├── manifest.json               # Manifiesto PWA para instalación en iOS / Safari
├── sw.js                       # Service Worker (caché slice-shell-v3, Network-First)
├── assets/                     # Icono SVG de la aplicación
├── css/
│   ├── tokens.css              # Variables de diseño, tipografía y safe areas de iOS
│   ├── layout.css              # Contenedores móviles, navegación flotante y retículas
│   └── components.css          # Tarjetas Liquid Glass, modales bottom-sheet, switches y checkboxes
├── js/
│   ├── config.js               # Configuración del cliente Supabase y moneda (MXN)
│   ├── supabaseClient.js       # Inicialización de createClient con persistencia de sesión
│   ├── auth.js                 # Flujo de autenticación, recordar correo y cierre de sesión
│   ├── store.js                # Estado reactivo en memoria y caché local Stale-While-Revalidate
│   ├── engine/                 # Motor financiero puro (100% testeable en Node.js)
│   │   ├── dateUtils.js        # Fechas ISO, ajuste de meses cortos (28/29/30/31) y formato MXN
│   │   ├── billingCycle.js     # Reglas de corte inclusivo, rollover y fechas límite de pago
│   │   ├── msiEngine.js        # Proyección MSI, remanente de centavos y soporte backfill
│   │   └── accounting.js       # Liquidez libre, arqueos, estados de cuenta, fijos y préstamos
│   ├── services/
│   │   └── api.js              # Capa de acceso a datos con Supabase PostgREST
│   └── ui/                     # Vistas y modales interactivos
│       ├── app.js              # Orquestador principal, autenticación y navegación
│       ├── dashboardView.js    # Vista Inicio (Liquidez Libre, cuentas, compromisos y movimientos)
│       ├── calendarView.js     # Vista Calendario financiero mensual interactivo
│       ├── cardsView.js        # Vista Tarjetas de Crédito y planes MSI activos
│       ├── recurringView.js    # Vista Gastos Fijos y Suscripciones
│       ├── loansView.js        # Sección Préstamos por cobrar ("Me deben")
│       ├── quickEntryModal.js  # Modal de registro rápido (<10s)
│       └── reconcileModal.js   # Modal de Arqueo Rápido ("Cuadrar Saldo")
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial_schema.sql  # Esquema PostgreSQL, restricciones CHECK, índices y RLS
│   └── seed.sql                     # Función seed_default_categories_for_user
└── tests/
    └── engine.test.js          # Pruebas unitarias nativas (node:test) del motor contable
```

---

## Ejecución local, pruebas y despliegue

### 1. Servidor local de desarrollo
Al no requerir compilación ni *bundlers*, basta con servir el directorio raíz mediante cualquier servidor HTTP estático:

```bash
npx serve .
# o con Python:
python -m http.server 8080
```

### 2. Pruebas unitarias del motor contable
Ejecuta la suite nativa de Node.js para validar cálculos de fechas, ciclos de corte, MSI y contabilidad en centavos enteros:

```bash
node --test ./tests/engine.test.js
```

### 3. Despliegue en GitHub Pages e instalación en iPhone
1. Cada *push* a la rama `main` publica automáticamente la PWA en `https://angelgcastillocode.github.io/slice/`.
2. Al actualizar activos del App Shell, incrementa `CACHE_NAME` en `./sw.js` para que iOS descargue y active la nueva versión automáticamente mediante `skipWaiting()` y `clients.claim()`.
3. En iPhone: abre la URL en **Safari**, toca el botón **Compartir** y selecciona **"Agregar a inicio"** para usar Slice en pantalla completa con soporte de **Llavero de iCloud / Face ID**.

---

## Cambios recientes (Changelog)

- **Persistencia de sesión y autocompletado iOS (`6c95692`):**
  - Se optimizó `#auth-form` con atributos nativos (`autocomplete="username"`, `autocomplete="current-password"`, `inputmode="email"`, `autocapitalize="none"`) para integración directa con Llavero de iCloud y Face ID en iOS Safari.
  - Se agregó el checkbox Liquid Glass **"Recordar sesión y correo"** (`#auth-remember`), persistiendo el correo normalizado en `localStorage` incluso después de cerrar sesión y enfocando automáticamente el campo de contraseña.
  - Se configuró `storageKey: 'slice-auth-token'` con `persistSession: true` y `autoRefreshToken: true` en `supabaseClient.js`.
  - Se actualizó el Service Worker a `slice-shell-v3`.
- **Producción en Supabase y despliegue PWA en GitHub Pages (`8e463eb`):**
  - Migración inicial de esquema PostgreSQL 17 con RLS por usuario único (`0001_initial_schema.sql`) y siembra automática de categorías base (`seed_default_categories_for_user`).
  - Publicación de la PWA en GitHub Pages conectada directamente al proyecto de producción `slice` en Supabase.
