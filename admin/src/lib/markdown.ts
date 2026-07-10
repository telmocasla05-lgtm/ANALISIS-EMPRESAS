// Conversor mínimo de markdown a HTML para los informes (§10). El generador
// (services/informe-claude.ts del backend) pide markdown sencillo: títulos ##/###,
// listas con "-" o numeradas, y negrita/cursiva. Todo se escapa antes de convertir.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function markdownToHtml(markdown: string): string {
  const lines = escapeHtml(markdown).split(/\r?\n/);
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };
  const closeParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (trimmed === '') {
      closeParagraph();
      closeList();
    } else if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(heading[1]!.length + 1, 4); // "#"/"##" → h2, "###" → h4 como tope
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (bullet || numbered) {
      closeParagraph();
      const wanted = bullet ? 'ul' : 'ol';
      if (list !== wanted) {
        closeList();
        html.push(`<${wanted}>`);
        list = wanted;
      }
      html.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`);
    } else {
      closeList();
      paragraph.push(trimmed);
    }
  }
  closeParagraph();
  closeList();
  return html.join('\n');
}
