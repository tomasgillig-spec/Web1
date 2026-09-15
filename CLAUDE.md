# UADEL — Base de Prospección + Tablero de KPIs

Contexto para retomar este proyecto en Claude Code. Leer esto antes de
tocar nada.

## ⚠️ Primero: decidir la fuente de verdad

Hoy existen DOS copias de los datos que pueden estar desincronizadas:

1. **Google Sheet** — es lo que lee el dashboard web en producción
   (`uadel.claudiopiscicelli.com`) vía la API de Google Sheets. Este es
   el que ve el cliente, en tiempo real.
2. **Archivo Excel** (`Seguimiento_Contactos_UADEL.xlsx`) — se fue
   subiendo y bajando a mano en varias sesiones de chat. Puede no
   coincidir con el Google Sheet actual.

**Antes de editar nada, confirmar cuál es la fuente real y, si hace
falta, sincronizar una contra la otra.** Recomendación: dejar el Google
Sheet como única fuente de verdad (así el dashboard siempre refleja lo
último) y usar el Excel solo como respaldo/exportación ocasional, no
como algo que se edita en paralelo.

## Estructura de carpetas sugerida

```
uadel-proyecto/
├── CLAUDE.md                    (este archivo)
├── dashboard/                   (el proyecto web, ver abajo)
│   ├── index.html
│   ├── middleware.js
│   ├── package.json
│   ├── api/data.js
│   ├── fonts/, img/, chart.umd.js
│   └── README.md                (guía de deploy completa)
└── excel/
    └── Seguimiento_Contactos_UADEL.xlsx   (si se usa como respaldo)
```

Recomendado: `git init` en la raíz para tener historial de cambios y
poder revertir si algo se rompe.

## El Google Sheet / Excel — estructura

**Hoja "Seguimiento de Contactos"** (266+ filas):
`Nombre | Empresa | Cargo | Industria | Plaza | Web | LinkedIn | Email |
Teléfono | Estado | Fecha de Contacto | Próxima Acción | Fecha Próximo
Seguimiento | Comentarios | Fecha de Alta`

- `Industria` solo puede ser: Automotriz, Financiera, Logística, Energía.
- `Estado` tiene lista desplegable: Nuevo, Rebotado, Contactado, En
  conversación, Reunión agendada, Propuesta enviada, Interesado, No
  interesado, Cerrado - Ganado, Cerrado - Perdido.
- `Fecha de Alta` se agregó después — los contactos viejos (antes de
  sept 2026) no la tienen cargada.

**Hoja "Log de Envíos"** (1 fila por acción de contacto, no por
contacto):
`Fecha | Nombre | Empresa | Canal | Tipo de Acción | Resultado |
Comentarios`

- `Canal`: Email, Teléfono, LinkedIn.
- `Resultado`: Enviado, Rebotado, Sin respuesta, Respondió - Interesado,
  Respondió - No interesado, Reunión agendada, Cerrado - Ganado, Cerrado
  - Perdido.
- Se generó una carga inicial "migrada" desde el Estado de la hoja de
  contactos (130 filas, marcadas con "Migrado desde Seguimiento de
  Contactos" en Comentarios) — de ahí en más se carga a mano por cada
  acción real.

**Hoja "Tablero KPIs"** (solo existe en la versión Excel, no se usa en
el dashboard web): tiene un selector de mes con fórmulas COUNTIFS/
SUMPRODUCT y una tabla auxiliar de meses en columnas Q:S. Fue el primer
prototipo antes de construir el dashboard web — hoy es redundante con
`dashboard/`, pero si se sigue usando el Excel como respaldo, mantenerla
consistente.

## ⚠️ Bug ya resuelto — no reintroducirlo

Google Sheets devuelve las fechas como texto `DD/MM/YYYY` (formato
argentino). `new Date("01/09/2026")` en JavaScript lo interpreta como
`MM/DD/YYYY` → 9 de enero en vez de 1 de septiembre. La función
`parseSheetDate()` en `dashboard/api/data.js` ya lo maneja bien con un
regex explícito — cualquier código nuevo que parsee fechas de estas
hojas tiene que usar esa misma función o el mismo criterio, nunca
`new Date(stringDelSheet)` directo.

## El dashboard web (`dashboard/`)

- **Stack**: HTML+JS vanilla (Chart.js local, sin CDN externo — hubo
  problemas de bloqueo de CDN) + una función serverless en
  `api/data.js` (Node, usa `googleapis`) que autentica con una Service
  Account de Google y devuelve SOLO datos agregados (nunca nombres,
  emails ni teléfonos individuales — decisión explícita para que el
  cliente no vea datos personales).
- **Hosting**: Vercel (plan gratis), dominio `uadel.claudiopiscicelli.com`
  vía CNAME en GoDaddy. El VPS de DonWeb NO se usa para esto.
- **Auth**: protegido con Basic Auth vía `middleware.js` (variables de
  entorno `DASH_USER` / `DASH_PASS` en Vercel). Sin esas variables
  configuradas, el middleware bloquea el acceso (falla cerrado, no
  abierto).
- **Variables de entorno en Vercel** (Settings → Environment Variables,
  marcar Production/Preview/Development en cada una):
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
  - `SHEET_ID`
  - `DASH_USER`, `DASH_PASS`
- **Identidad visual**: paleta y tipografías de CP&A (manual de marca
  2025) — carbón `#4F4E50`, bordó `#4D0409`, rojo `#AD0404` / `#D11528`,
  tipografía Poppins (títulos) + Source Sans Pro (cuerpo), isologotipo
  en el header (pensado para fondo oscuro).
- **Interactividad**: las barras de "Contactos por mes" y "Envíos por
  mes" son clickeables y filtran el selector de período.
- Guía de deploy completa (paso a paso, incluye cómo crear la Service
  Account) en `dashboard/README.md`.

## Flujo de trabajo recomendado para editar el Excel/Sheet sin miedo

1. Antes de cualquier cambio de fórmulas o estructura, hacer una copia
   de respaldo (o confirmar que hay historial de versiones si es
   Google Sheet — Archivo → Historial de versiones).
2. Si se edita el `.xlsx` con Python/openpyxl: después de cualquier
   cambio de fórmulas, correr el recalculador
   (`/mnt/skills/public/xlsx/scripts/recalc.py`, disponible en el
   entorno de Claude) para detectar errores de fórmula antes de dar
   el archivo por bueno — así se agarraron varios bugs en este
   proyecto (referencias a celda equivocada, etc.).
3. Si se edita el Google Sheet directamente (recomendado, ya que es la
   fuente real), probar el dashboard después (recargar la página) para
   confirmar que los números siguen cerrando.
4. Cualquier cambio de nombres de columnas en las hojas rompe
   `dashboard/api/data.js` (usa los headers para mapear índices) — si
   se renombra una columna, hay que actualizar ese archivo también.
