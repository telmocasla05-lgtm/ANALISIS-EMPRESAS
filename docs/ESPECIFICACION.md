# Digital Power — Sistema de Tracking Pasivo

**Especificación técnica para desarrollo (Claude Code)**
Versión 1.0 · Julio 2026 · Documento interno de socios

---

## 1. Qué es esto y para qué sirve

Sistema propio de Digital Power que mide de forma automática y pasiva en qué invierte el tiempo cada empleado de una empresa cliente, sin necesidad de que marque cada tarea manualmente (nada de start/stop por tarea). El empleado solo activa una sesión al empezar su turno (ON) y la cierra al acabar (OFF); mientras está en ON, el sistema detecta en segundo plano qué aplicación/ventana está usando y lo categoriza según reglas predefinidas por sector.

Este sistema es la Fase 0 (diagnóstico) del modelo de negocio de Digital Power, pero se queda instalado de forma **permanente** durante toda la relación con el cliente (Fase 1, 2 y 3), sirviendo como:

1. Herramienta de diagnóstico inicial (detectar qué automatizar).
2. Prueba de ROI continua (demostrar el ahorro real tras automatizar).
3. Sistema de registro horario (control horario, obligatorio por ley en España desde 2019) como beneficio añadido para el cliente.

---

## 2. Alcance por dispositivo — IMPORTANTE, leer antes de nada

Se pidió soporte para Windows, Mac y tablets/móvil, tanto para panel de administración como para empleados trackeados. Hay una limitación técnica real que hay que tener clara desde el inicio para no perder tiempo de desarrollo:

| Dispositivo | Tracking pasivo de apps (automático) | Panel admin / dashboard |
|---|---|---|
| **Windows** | ✅ Totalmente viable (Electron + librería de detección de ventana activa) | ✅ Viable (web) |
| **Mac** | ✅ Viable, requiere permisos de accesibilidad que el usuario debe aceptar una vez | ✅ Viable (web) |
| **Tablet / móvil (iOS / Android)** | ⚠️ No viable de forma pasiva con esfuerzo razonable. El sistema operativo no permite a una app normal leer qué otra app está usando el usuario, salvo que el dispositivo esté enrolado en un sistema de gestión empresarial (MDM — Apple Business Manager / Android Enterprise), lo cual añade coste, complejidad de despliegue y no es realista para un MVP ni para la mayoría de clientes PYME. | ✅ Viable (web responsive) |

### Recomendación para el MVP

- **Windows y Mac** (ordenadores de oficina/recepción/gerencia): tracking pasivo completo, tal y como se ha diseñado.
- **Tablets/móvil** (ej. recepción con iPad, personal itinerante): en vez de tracking pasivo, usar un sistema de **selección activa simplificada** — el empleado, tras dar a ON, ve 4-6 botones grandes con las categorías de su rol (ej. "Historiales", "Llamadas", "Recepción presencial") y toca la que corresponde cuando cambia de tarea. No es pasivo al 100%, pero es la única opción realista sin invertir en MDM, y sigue siendo mucho menos fricción que un cronómetro por micro-tarea tipo Toggl.
- El **panel de administración** (donde vosotros y el dueño del negocio veis los datos) sí funciona igual de bien en móvil/tablet, porque es simplemente una web responsive.
- Dejamos la puerta abierta a evaluar MDM en el futuro si algún cliente grande lo justifica, pero no entra en el MVP.

---

## 3. Arquitectura general (3 capas)

```
CAPA 1 — TRACKING (Windows/Mac: pasivo · Tablet: selección activa simplificada)
  ↓ datos crudos: sesión, empleado, timestamps, app/ventana/URL detectada

CAPA 2 — ANÁLISIS E INFORME
  ↓ agregación por categoría/empleado/semana + coste en €
  ↓ borrador de informe generado con ayuda de IA
  ↓ revisado y editado por Digital Power antes de enviarlo al cliente

CAPA 3 — AUTOMATIZACIÓN (servicio ya existente de Digital Power, vía n8n)
  ↓ implementación de automatizaciones según lo priorizado en el informe
  ↓ el tracking sigue corriendo → mide el ahorro real (antes vs. después)
```

---

## 4. Arquitectura de backend: multi-cliente (recomendación)

Se recomienda una **plataforma única multi-tenant** (un solo backend que sirve a todos los clientes de Digital Power), en lugar de desplegar una instalación independiente por cliente.

### Por qué

- Coste de infraestructura mucho menor (un solo servidor/base de datos en vez de N).
- Mantenimiento y actualizaciones en un solo sitio: una mejora sirve para todos los clientes a la vez.
- Encaja con el modelo de negocio: cuantos más clientes, mejor amortizáis el desarrollo.
- Cada empresa cliente es un "workspace" aislado dentro de la misma base de datos (sus datos nunca se mezclan con los de otro cliente).

### Estructura de datos (multi-tenant)

```
Empresa (cliente de Digital Power)
└─ Roles (ej: Gerente, Recepción, Médico, Enfermera)
   └─ Empleados (nombre, rol, PIN)
      └─ Sesiones (hora ON, hora OFF, dispositivo)
         └─ Registros (timestamp, app, título ventana, URL si aplica, categoría asignada)
```

Proyecto e infraestructura completamente nuevos y separados de `app-conta` (no se reutiliza Railway/Vercel de ese proyecto, aunque sí se puede reutilizar patrones de código si resulta útil).

---

## 5. Identificación del empleado (ON/OFF)

- Cada empleado tiene un **PIN numérico corto** (4 dígitos), no contraseña compleja — el objetivo es que fichar sea tan rápido como un cajero automático, sin fricción.
- Flujo:
  1. Se abre la app → lista de empleados de esa empresa (nombre + foto/avatar opcional).
  2. Empleado toca su nombre → introduce PIN de 4 dígitos.
  3. Pantalla grande con botón **ON** → lo pulsa al empezar turno.
  4. El tracking pasivo corre en segundo plano (Windows/Mac) o aparecen los botones de categoría (tablet).
  5. Botón **OFF** al terminar turno → cierra sesión, sube los datos acumulados.
- En ordenadores compartidos (ej. recepción por turnos), cada persona ficha su propia sesión al sentarse; el ordenador no queda "fijo" a un nombre.

---

## 6. Detección de inactividad

- Si no hay actividad de ratón/teclado durante un tiempo configurable (ej. 10 minutos) mientras la sesión está en ON, el sistema **no pausa automáticamente sin avisar**: muestra un aviso tipo *"¿Sigues aquí? Se pausará el tracking en 1 minuto si no respondes"*.
- Si el empleado no responde, se pausa y ese tiempo no se cuenta en ninguna categoría (queda registrado como "inactivo/pausa").
- Si responde, sigue contando con normalidad. Esto cubre el caso de "atención presencial sin usar el ordenador" sin perder ese tiempo como un hueco sin explicar, y sin ser intrusivo.

---

## 7. Transparencia con el empleado

- Icono visible en la barra de tareas/bandeja del sistema mientras el tracking está en ON, minimalista y discreto (no un banner grande, pero tampoco oculto).
- Aviso informativo obligatorio la primera vez que un empleado usa la app, explicando qué se mide (aplicación/ventana usada, no contenido ni pulsaciones de teclado) y durante qué horario (solo el que él mismo activa).
- **Nota legal para trasladar a un abogado laboralista antes de lanzar a clientes reales:** en España el control horario es obligatorio, pero la monitorización de actividad debe cumplir LOPDGDD — el empleado debe estar informado explícitamente y por escrito de qué se mide. Recomendamos incorporar un texto de consentimiento/información dentro de la propia app en el primer uso, y que Digital Power facilite al cliente un modelo de aviso a firmar por sus empleados.

---

## 8. Qué se captura exactamente

- Nombre de la aplicación activa (ej. "Excel", "Outlook", "Sistema de gestión clínica X").
- Título de la ventana (ej. "Facturas_Enero.xlsx" — permite luego mayor precisión en el informe, aunque no se muestra tal cual al cliente si contiene datos sensibles).
- Si es un navegador: la URL (dominio, no necesariamente la URL completa con parámetros sensibles).
- Timestamp de cada lectura (frecuencia recomendada: cada 5-10 segundos mientras está en ON y sin inactividad).

---

## 9. Categorización

- Reglas fijas definidas por Digital Power, organizadas **por sector** (ej. plantilla "Clínica", plantilla "Gestoría", plantilla "Inmobiliaria").
- Ejemplo de mapeo para clínica:

| Aplicación / origen | Categoría |
|---|---|
| "Excel", "Google Sheets" | Hojas de cálculo / gestión manual |
| "Outlook", "Gmail" | Email |
| "WhatsApp", "WhatsApp Web" | Mensajería / atención cliente |
| "[Software gestión clínica]" | Sistema de gestión |
| "Chrome/Edge - dominio no reconocido" | Sin categorizar / revisar |

- Estas reglas viven en configuración (tabla en base de datos), no hardcodeadas, para poder ajustarlas por cliente sin tocar código cada vez.
- No se pide al cliente que configure nada al inicio; Digital Power aplica la plantilla del sector y ajusta si hace falta tras ver los primeros datos.

---

## 10. Generación del informe

- El backend agrega los datos: horas por categoría / por empleado / por semana, y las convierte a coste en euros usando un coste/hora medio del negocio (no el sueldo individual de cada persona, para evitar fricción y sensibilidad de datos).
- Se genera un **borrador de informe** automáticamente (apoyándose en la API de Claude para redactar el análisis y las recomendaciones a partir de los datos agregados), pero **nunca se envía directamente al cliente**: Digital Power lo revisa y edita antes de mandarlo.
- El informe incluye: mapa de tiempo por categoría, coste estimado, top 3 automatizaciones recomendadas (según reglas/plantillas de automatización por sector, no generadas libremente), y ahorro estimado.
- Con el tiempo (Fase 2 y 3), el mismo sistema genera la comparativa "antes vs. después" de cada automatización implementada, sirviendo de base para la renovación y el dashboard de ahorro en tiempo real de la fase "Socio tecnológico".

---

## 11. Stack técnico propuesto

| Componente | Tecnología |
|---|---|
| App de escritorio (Windows/Mac) | Electron + React + TypeScript |
| Detección de ventana activa | Librería tipo `active-win` (Node.js) |
| App tablet/móvil | Web app responsive (React) con selección de categoría, o app ligera empaquetada (ej. Capacitor) si se necesita acceso nativo |
| Backend | Node.js + Express + TypeScript |
| Base de datos | PostgreSQL (recomendado sobre SQLite para multi-tenant con varios clientes concurrentes) |
| Panel admin / dashboard | React + Recharts (gráficos) |
| Generación de informes | API de Claude (Anthropic) sobre los datos agregados, con revisión humana posterior |
| Infraestructura | Nueva y separada de `app-conta` — Railway (backend/BD) + Vercel (frontend admin) como opción por familiaridad del equipo |

---

## 12. Fases de desarrollo sugeridas

**FASE A (semanas 1-2): Backend multi-tenant + modelo de datos**
- Empresas, roles, empleados, sesiones, registros
- Auth simple (PIN por empleado)
- Motor de categorización por reglas (configurable por sector)

**FASE B (semanas 3-5): App de escritorio (Electron)**
- Login por PIN + pantalla ON/OFF
- Tracking pasivo (integración active-win)
- Detección de inactividad con aviso
- Icono de bandeja del sistema

**FASE C (semana 6): App tablet (web responsive)**
- Selección activa de categoría (botones grandes por rol)

**FASE D (semanas 7-8): Panel admin + informes**
- Dashboard de horas por categoría/empleado
- Cálculo de coste en €
- Generación de borrador de informe con Claude API

**FASE E (semana 8+): Piloto real**
- Primer cliente (ej. clínica o gestoría ya conocida) con seguimiento cercano

---

## 13. Pendiente de resolver antes de lanzar a clientes reales (no bloquea el desarrollo)

- Redacción del texto de consentimiento/información al empleado con un abogado laboralista.
- Firma digital (code signing) de la app de escritorio para que no sea marcada como sospechosa por antivirus corporativos.
- Política de retención de datos: cuánto tiempo se guardan los registros detallados (ventanas/URLs) frente al agregado semanal.

---

*Digital Power — Documento técnico interno, para desarrollo con Claude Code*
