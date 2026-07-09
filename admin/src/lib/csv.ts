// Exportación CSV compatible con Excel en español: separador ';', BOM UTF-8
// y saltos CRLF.

const BOM = '\uFEFF';

function escapeCell(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const content = BOM + rows.map((row) => row.map(escapeCell).join(';')).join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
