// Exportación del informe revisado a PDF: se abre una ventana con el documento
// maquetado (marca de Digital Power, A4, tipografía limpia) y se lanza el diálogo
// de impresión del navegador ("Guardar como PDF"). Sin dependencias externas.
import type { InformeDetalle } from '@digital-power/shared';
import { fmtFecha } from './format';
import { markdownToHtml } from './markdown';

const PDF_STYLES = `
  @page { size: A4; margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1f2933;
    font-size: 11pt;
    line-height: 1.55;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 3px solid #0f4c81;
    padding-bottom: 10px;
    margin-bottom: 6px;
  }
  .marca { font-size: 17pt; font-weight: 700; color: #0f4c81; letter-spacing: 0.02em; }
  .marca small { display: block; font-size: 8.5pt; font-weight: 400; color: #52606d; letter-spacing: 0.08em; text-transform: uppercase; }
  .fecha-emision { font-size: 9pt; color: #52606d; }
  h1 { font-size: 16pt; color: #102a43; margin: 22px 0 4px; }
  .meta { font-size: 9.5pt; color: #52606d; margin: 0 0 18px; }
  .contenido h2 { font-size: 12.5pt; color: #0f4c81; margin: 22px 0 8px; border-bottom: 1px solid #d9e2ec; padding-bottom: 4px; }
  .contenido h3 { font-size: 11pt; color: #102a43; margin: 16px 0 6px; }
  .contenido h4 { font-size: 10.5pt; color: #102a43; margin: 12px 0 4px; }
  .contenido p { margin: 0 0 9px; text-align: justify; }
  .contenido ul, .contenido ol { margin: 0 0 10px; padding-left: 20px; }
  .contenido li { margin-bottom: 4px; }
  footer {
    margin-top: 28px;
    padding-top: 8px;
    border-top: 1px solid #d9e2ec;
    font-size: 8.5pt;
    color: #829ab1;
  }
`;

export function exportInformePdf(informe: InformeDetalle, empresaNombre: string): void {
  const win = window.open('', '_blank');
  if (!win) return; // bloqueado por el navegador: el botón sigue disponible

  const emision = fmtFecha(informe.updatedAt);
  win.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${informe.title.replace(/</g, '&lt;')} · ${empresaNombre.replace(/</g, '&lt;')}</title>
  <style>${PDF_STYLES}</style>
</head>
<body>
  <header>
    <div class="marca">Digital Power<small>Diagnóstico y automatización</small></div>
    <div class="fecha-emision">${emision}</div>
  </header>
  <h1>${informe.title.replace(/</g, '&lt;')}</h1>
  <p class="meta">Preparado para <strong>${empresaNombre.replace(/</g, '&lt;')}</strong> · Periodo analizado:
    ${fmtFecha(informe.periodo.desde)} – ${fmtFecha(informe.periodo.hasta)}</p>
  <div class="contenido">${markdownToHtml(informe.content)}</div>
  <footer>Documento confidencial elaborado por Digital Power. Los ahorros indicados son estimaciones basadas en el tiempo medido.</footer>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`);
  win.document.close();
}
