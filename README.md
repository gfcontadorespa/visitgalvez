# Registro de Visitas PH 🏢

Bot de Telegram para registrar visitas de una propiedad horizontal (PH) con dos torres: **T100** y **T200**, pisos 1-6, unidades con letras de la A a la P (ej: 4A, 3B, 1C, 6P).

Stack: **Node.js + TypeScript · grammY · Supabase · QR deep-link**

## Instalación

```bash
npm install
npm run build
```

## Configuración

1. Copiá `.env.example` a `.env` y completá las variables (`BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Schema Supabase

Ejecutá el script `sql/schema.sql` en la consola SQL de Supabase. Crea:

- `users`: perfiles de Telegram (propietario o guardia, con WhatsApp guardado en perfil).
- `units`: unidades físicas (T100/T200, pisos 1-6, letras A-P). Se genera automáticamente el seed con 192 unidades (2 torres x 6 pisos x 16 letras).
- `user_units`: relación propietario ↔ unidad.
- `visits`: cada visita con código de confirmación para deep-link QR.

## Flujos del bot

| Comando / acción | Descripción |
|---|---|
| `/start` | Onboarding: rol (propietario/guardia), torre, unidad, WhatsApp, correo |
| Menú | Botones: Registrar visita · Registrar salida |
| `Registrar visita` | Formulario paso a paso: pie/auto, nombre del visitante, placa (si es auto). Genera QR con deep-link de Telegram |
| `start visita_XXXX` (deep-link) | Guardia escanea QR → ve datos → **Confirma llegada** |
| `Registrar salida` | Guardia o propietario escribe código interno de la visita activa para marcar salida |
| WhatsApp | Se guarda en el perfil (número +507 normalizado). Sin link wa.me por ahora |

## Despliegue en Easypanel

1. Creá un proyecto Node.js.
2. Configurá las variables de entorno (`.env`).
3. Comando de build: `npm run build`
4. Comando de inicio: `npm start`
5. El bot usa **polling** (compatible con Easypanel, sin webhook).

## Desarrollo local

```bash
cp .env.example .env
# Completá BOT_TOKEN, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev    # ts-node con hot-reload
```

## Verificación de tipos

```bash
npm run typecheck
```
