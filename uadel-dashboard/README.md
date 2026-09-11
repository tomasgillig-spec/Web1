# UADEL — Tablero de Prospección (dashboard web)

Dashboard con las mismas métricas del Excel (Resumen general, Cobertura por
canal, Avance por rubro, Contactos por estado, Contactos agregados por mes,
Envíos por mes, Indicadores de envíos, Cerrados por industria), leyendo en
vivo desde el Google Sheet. Solo muestra datos agregados — nunca nombres,
emails ni teléfonos de contactos individuales.

## 1) Crear la Service Account de Google (una sola vez)

1. Entrá a https://console.cloud.google.com/ y creá un proyecto nuevo (o
   usá uno existente), por ejemplo "uadel-dashboard".
2. En el buscador de arriba escribí **"Google Sheets API"** → **Habilitar**.
3. Andá a **APIs y servicios → Credenciales → Crear credenciales → Cuenta
   de servicio**. Ponele un nombre (ej. `uadel-dashboard-reader`) y creála.
4. Entrá a la cuenta de servicio recién creada → pestaña **Claves** → **Agregar
   clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`: guardalo,
   ahí adentro están `client_email` y `private_key` (los vas a necesitar en el
   paso 3).
5. Copiá el valor de `client_email` (algo como
   `uadel-dashboard-reader@tu-proyecto.iam.gserviceaccount.com`).
6. Abrí tu Google Sheet de "Seguimiento de Contactos" → botón **Compartir**
   → pegá ese email → dale permiso de **Lector** → Enviar.
   (Sin este paso el dashboard no va a poder leer nada.)

## 2) Subir el proyecto a Vercel

1. Creá una cuenta gratis en https://vercel.com (podés entrar con GitHub o
   con tu email).
2. Instalá la CLI de Vercel una sola vez (necesita Node.js instalado):
   ```
   npm install -g vercel
   ```
3. Parado en esta carpeta (`uadel-dashboard/`), corré:
   ```
   vercel
   ```
   Te va a preguntar nombre de proyecto (podés dejar el default) y
   confirmar. Al terminar te da una URL de prueba tipo
   `uadel-dashboard.vercel.app` — todavía no va a funcionar porque faltan
   las variables de entorno (paso 3).

## 3) Configurar las variables de entorno

En https://vercel.com → tu proyecto → **Settings → Environment Variables**,
agregá estas tres (marcá los 3 entornos: Production, Preview, Development):

| Nombre | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON del paso 1 |
| `GOOGLE_PRIVATE_KEY` | el `private_key` del JSON del paso 1 (completo, con los `\n`) |
| `SHEET_ID` | el ID del Google Sheet (está en la URL: `.../d/ESTE_ES_EL_ID/edit`) |

Después de guardarlas, volvé a desplegar para que tomen efecto:
```
vercel --prod
```

## 4) Apuntar el subdominio uadel.claudiopiscicelli.com

1. En Vercel → tu proyecto → **Settings → Domains** → escribí
   `uadel.claudiopiscicelli.com` → **Add**. Vercel te va a mostrar un
   registro para agregar en GoDaddy (normalmente un **CNAME** apuntando a
   `cname.vercel-dns.com`).
2. En GoDaddy → **Mi cuenta → Dominios → claudiopiscicelli.com → DNS** →
   **Agregar registro**:
   - Tipo: `CNAME`
   - Nombre/Host: `uadel`
   - Valor: `cname.vercel-dns.com` (o el que te haya mostrado Vercel)
   - TTL: dejar el default
3. Esperá unos minutos a que propague. Vercel activa el SSL (candadito)
   automáticamente, no hay que hacer nada más.

## Notas

- El VPS de DonWeb no se usa para nada de esto — queda libre para lo que ya
  tenían.
- Cualquier cambio en el Google Sheet se refleja al recargar la página (no
  hace falta redeployar).
- Si en algún momento cambian nombres de columnas en las hojas
  "Seguimiento de Contactos" o "Log de Envíos", avisame y ajusto
  `api/data.js`.
