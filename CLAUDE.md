# CLAUDE.md — Digital Power · Sistema de Tracking Pasivo

## Qué es este proyecto

Plataforma multi-tenant de Digital Power que mide de forma **automática y pasiva** en qué invierte el tiempo cada empleado de una empresa cliente. El empleado solo pulsa ON al empezar su turno y OFF al acabar; mientras está en ON, el sistema detecta en segundo plano la aplicación/ventana activa y la categoriza según reglas predefinidas por sector (clínica, gestoría, inmobiliaria…).

Sirve como: (1) diagnóstico inicial de qué automatizar, (2) prueba de ROI continua tras automatizar, y (3) registro horario (obligatorio por ley en España).

**La especificación completa está en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) — leerla antes de implementar cualquier funcionalidad.**

Puntos clave que no hay que olvidar:

- **Multi-tenant**: un solo backend/BD para todos los clientes. Cada empresa es un workspace aislado; **toda consulta debe filtrar por empresa**. Los datos de un cliente nunca se mezclan con los de otro.
- **Tracking pasivo solo en Windows/Mac** (Electron). En tablet/móvil no es viable sin MDM: allí se usa **selección activa simplificada** (4-6 botones grandes de categoría por rol).
- Identificación por **PIN de 4 dígitos** (sin fricción, tipo cajero automático).
- Detección de inactividad **con aviso previo** (nunca pausar en silencio).
- Transparencia: icono visible en bandeja mientras trackea + aviso informativo en el primer uso (LOPDGDD).
- Las **reglas de categorización viven en la base de datos** (configurables por sector/cliente), nunca hardcodeadas.
- Los informes generados con la API de Claude son **borradores**: siempre los revisa Digital Power antes de enviarse al cliente.

## Stack

| Componente | Tecnología |
|---|---|
| Backend API | Node.js + Express + TypeScript |
| Base de datos | PostgreSQL |
| App escritorio (Windows/Mac) | Electron + React + TypeScript (detección de ventana activa con librería tipo `active-win` / `get-windows`) |
| App tablet/móvil | Web app responsive en React (selección activa de categoría) |
| Panel admin | React + Recharts |
| Informes | API de Claude (Anthropic) sobre datos agregados, con revisión humana |
| Infraestructura | Railway (backend + BD) + Vercel (admin). Nueva y separada de `app-conta` |

## Estructura del monorepo

```
.
├── backend/    API REST (Express + TypeScript) — auth por PIN, sesiones, registros, categorización, informes
├── desktop/    App Electron (Windows/Mac) — login PIN, ON/OFF, tracking pasivo, inactividad, icono bandeja
├── tablet/     Web app responsive (React + Vite) — selección activa de categoría con botones grandes
├── admin/      Panel de administración (React + Vite + Recharts) — dashboards y revisión de informes
├── shared/     Tipos TypeScript compartidos entre paquetes (@digital-power/shared)
└── docs/       Documentación (ESPECIFICACION.md)
```

Es un monorepo con **npm workspaces** (definidos en el `package.json` raíz). Cada paquete tiene su propio `package.json` y su `tsconfig.json` que extiende `tsconfig.base.json`.

## Convenciones de código

- **TypeScript estricto** (`strict: true`) en todos los paquetes; sin `any` salvo justificación.
- **Código e identificadores en inglés**; textos de UI, comentarios de dominio y documentación en español.
- Componentes React en `PascalCase`; variables/funciones en `camelCase`; archivos de componentes `PascalCase.tsx`, resto `kebab-case.ts`.
- Los tipos compartidos entre backend y frontends van en `shared/`, no se duplican.
- Nada de credenciales ni secretos en el código: todo por variables de entorno (ver `.env.example`).
- Commits en español siguiendo Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`…

## Comandos

Requiere Node.js >= 20.

```bash
npm install              # instala todas las dependencias del monorepo (raíz)

npm run dev:backend      # arranca la API en modo desarrollo (tsx watch)
npm run dev:desktop      # arranca la app Electron
npm run dev:tablet       # arranca la web app de tablet (Vite)
npm run dev:admin        # arranca el panel de administración (Vite)

npm run build            # compila todos los paquetes
npm run typecheck        # typecheck de todos los paquetes
```

## Variables de entorno

Copiar `.env.example` a `.env` en la raíz y rellenar:

- `PORT` — puerto de la API del backend.
- `DATABASE_URL` — cadena de conexión PostgreSQL.
- `JWT_SECRET` — secreto para firmar los tokens de sesión.
- `ANTHROPIC_API_KEY` — clave de la API de Claude para la generación de borradores de informe.

## Estado actual

Solo existe la estructura del monorepo y la configuración base. **No hay lógica de negocio implementada todavía.** Las fases de desarrollo (A–E) están definidas en la sección 12 de la especificación.
