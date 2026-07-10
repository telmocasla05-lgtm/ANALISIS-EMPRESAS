// Verificación del generador de informes contra la API real de Claude (§10):
// agrega los datos del periodo con buildInformeDatos, pide el borrador de
// verdad a la API (requiere ANTHROPIC_API_KEY con saldo en backend/.env) y
// comprueba que el resultado respeta la estructura y solo recomienda
// automatizaciones de las plantillas del sector.
//
// No escribe nada en la BD salvo que se pase --guardar, que persiste el
// borrador igual que el endpoint POST para poder revisarlo en el panel.
//
// Uso (desde backend/):
//   npx tsx scripts/verify-informe-real.ts [--empresa <slug>] [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD] [--guardar]
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { buildInformeDatos } from '../src/services/informe-datos.js';
import { generarBorradorInforme } from '../src/services/informe-claude.js';
import { getDateRange } from '../src/services/resumen.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`✅ ${message}`);
}

function fmtFecha(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey || apiKey.length < 20) {
    fail('ANTHROPIC_API_KEY ausente o placeholder en backend/.env — pon una clave real con saldo.');
  }

  const slug = arg('empresa') ?? 'clinica-demo';
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = arg('desde') ?? hoy;
  const hasta = arg('hasta') ?? hoy;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) fail(`No existe la empresa con slug "${slug}" (¿falta npm run db:seed?)`);

  const range = getDateRange(desde, hasta);
  const datos = await buildInformeDatos(company.id, range);
  if (datos.totales.horas === 0) {
    fail(`Sin actividad registrada entre ${desde} y ${hasta} — ficha algo primero o pasa --desde/--hasta.`);
  }
  if (datos.plantillasAutomatizacion.length === 0) {
    fail(`El sector ${company.sector} no tiene plantillas de automatización.`);
  }
  ok(`datos agregados: ${datos.totales.horas} h, ${datos.porCategoria.length} categorías, ${datos.plantillasAutomatizacion.length} plantillas`);

  console.log('… llamando a la API de Claude (puede tardar en torno a un minuto)');
  const t0 = Date.now();
  const borrador = await generarBorradorInforme(datos);
  ok(`borrador generado en ${Math.round((Date.now() - t0) / 1000)} s (modelo ${borrador.model}, ${borrador.content.length} caracteres)`);

  // Estructura exacta que exige el system prompt (services/informe-claude.ts).
  if (!borrador.content.startsWith('## Resumen ejecutivo')) fail('el borrador no empieza por "## Resumen ejecutivo"');
  for (const section of ['## Distribución del tiempo', '## Automatizaciones recomendadas', '## Próximos pasos']) {
    if (!borrador.content.includes(section)) fail(`falta la sección "${section}"`);
  }
  const recomendaciones = [...borrador.content.matchAll(/^### \d+\.\s*(.+)$/gm)].map((m) => m[1]!.trim());
  if (recomendaciones.length !== 3) fail(`se esperaban 3 automatizaciones recomendadas y hay ${recomendaciones.length}`);
  const titulos = datos.plantillasAutomatizacion.map((p) => p.title);
  for (const recomendacion of recomendaciones) {
    if (!titulos.some((t) => recomendacion.includes(t))) {
      fail(`la recomendación "${recomendacion}" no cita ninguna plantilla del sector (${titulos.join(' · ')})`);
    }
  }
  ok('estructura correcta y las 3 recomendaciones citan plantillas del sector');

  if (process.argv.includes('--guardar')) {
    const report = await prisma.report.create({
      data: {
        companyId: company.id,
        periodStart: range.start,
        periodEnd: range.end,
        title: `Informe de actividad · ${fmtFecha(range.start)} a ${fmtFecha(new Date(range.end.getTime() - 1))}`,
        content: borrador.content,
        draftContent: borrador.content,
        model: borrador.model,
      },
    });
    ok(`borrador guardado en BD (${report.id}) — revisable desde el panel admin`);
  }

  console.log('\n──── extracto del borrador ────\n');
  console.log(borrador.content.slice(0, 800) + '\n…');
  await prisma.$disconnect();
}

void main();
