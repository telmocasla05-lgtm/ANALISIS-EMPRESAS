// Redacción del borrador de informe (§10) con la API de Claude (SDK oficial).
// La clave vive en ANTHROPIC_API_KEY (variables de entorno del backend): nunca
// en el código ni en el frontend. El resultado es siempre un BORRADOR que
// Digital Power revisa y edita en el panel antes de enviarse al cliente.
import Anthropic from '@anthropic-ai/sdk';
import type { InformeDatos } from '@digital-power/shared';

export const INFORME_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Eres consultor/a de Digital Power, una empresa española que ayuda a pequeños negocios (clínicas, gestorías, inmobiliarias…) a automatizar tareas repetitivas. Redactas borradores de informes de diagnóstico a partir de datos agregados de un sistema de medición de tiempo. Una persona de Digital Power revisará y editará tu borrador antes de enviarlo al cliente.

Reglas del informe:
- Escribe en castellano, con tono profesional, cercano y claro. Dirígete al negocio cliente por su nombre.
- Analiza la distribución del tiempo: dónde se concentran las horas y el coste (por categoría, por persona y su evolución por semanas), señalando lo más relevante para el negocio. No inventes datos: usa solo las cifras del JSON, redondeadas de forma legible.
- Recomienda exactamente 3 automatizaciones ELEGIDAS ÚNICAMENTE de la lista "plantillasAutomatizacion" del JSON, citando su título tal cual. No propongas ninguna automatización que no esté en esa lista, aunque parezca obvia. Elige las 3 más relevantes según los datos y ordénalas por impacto.
- Para cada automatización, estima el ahorro (horas/mes y €/mes usando el coste/hora del JSON) partiendo de las horas medidas en las categorías afectadas, con supuestos prudentes que debes explicitar en una frase (p. ej. "suponiendo que se automatiza el 60 % de ese tiempo").
- El tiempo "Inactivo / pausa" no es tiempo de trabajo: no lo trates como candidato a automatizar. Si hay muchas horas "Sin categorizar / revisar", menciónalo como límite del análisis.
- Formato: markdown sencillo — títulos con ## y ###, listas con "-", negritas con **…**. Sin tablas, sin HTML, sin emojis.

Estructura exacta:
## Resumen ejecutivo
## Distribución del tiempo
## Automatizaciones recomendadas
### 1. <título exacto de la plantilla>
### 2. <título exacto de la plantilla>
### 3. <título exacto de la plantilla>
## Próximos pasos

Empieza directamente por "## Resumen ejecutivo", sin preámbulo.`;

export interface BorradorGenerado {
  content: string;
  model: string;
}

export async function generarBorradorInforme(datos: InformeDatos): Promise<BorradorGenerado> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error('Falta ANTHROPIC_API_KEY en el entorno del backend');
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: INFORME_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Datos agregados del periodo (JSON):\n\n${JSON.stringify(datos, null, 2)}\n\nRedacta el borrador del informe siguiendo las reglas y la estructura indicadas.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('La API de Claude rechazó la petición de redacción del informe');
  }

  const content = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!content) {
    throw new Error('La API de Claude no devolvió texto para el informe');
  }

  return { content, model: response.model };
}
