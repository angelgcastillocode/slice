# Slice — Gestor Financiero Personal PWA (Liquid Glass Monochromatic)

Aplicación web progresiva (PWA) *mobile-first* para Safari en iPhone, construida con **HTML5, CSS3 y Vanilla JS (ES Modules)** para el control de liquidez en múltiples cuentas, arqueo rápido (*"Cuadrar Saldo"*), tarjetas de crédito (fechas de corte, fechas límite de pago y reembolsos), motor de Meses Sin Intereses (MSI con soporte de *backfill*), gastos fijos recurrentes y préstamos a terceros (*"Me deben"*).

## Ejecución de Pruebas Unitarias del Motor Financiero

```bash
node --test ./tests/engine.test.js
```

## Estructura del Proyecto

* `./index.html`, `./manifest.json`, `./sw.js`, `./vercel.json`: App Shell de la PWA.
* `./css/tokens.css`, `./css/layout.css`, `./css/components.css`: Sistema visual **iOS Liquid Glass Monochromatic** (OLED `#000000`, cristal translúcido con bordes especulares y tipografía `tabular-nums`).
* `./js/engine/`: Motor financiero puro en centavos enteros (`dateUtils.js`, `billingCycle.js`, `msiEngine.js`, `accounting.js`).
* `./js/services/api.js` y `./js/store.js`: Adaptador dual (`localStorage` con datos de demostración en MXN + cliente Supabase PostgREST).
* `./supabase/migrations/0001_initial_schema.sql` y `./supabase/seed.sql`: Esquema PostgreSQL con candados `CHECK` y políticas de Row Level Security (RLS) para usuario único.
