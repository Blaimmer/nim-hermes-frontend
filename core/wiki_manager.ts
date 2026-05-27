import fs from 'fs/promises';
import path from 'path';

// NIM Memory Wiki Manager (OpenClaw adaptation)
// Guarda memorias a largo plazo estructuradas con claims, metadatos y evidencia

const WIKI_DIR = path.join(__dirname, '../data/wiki');

export class WikiManager {
  static async writePage(title: string, content: string) {
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filePath = path.join(WIKI_DIR, `${safeTitle}.md`);
    
    const frontmatter = `---
title: ${title}
date: ${new Date().toISOString()}
confidence: high
---
`;
    
    await fs.writeFile(filePath, frontmatter + content, 'utf8');
    return `Wiki page '${title}' saved successfully at ${safeTitle}.md`;
  }

  static async readPage(title: string) {
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filePath = path.join(WIKI_DIR, `${safeTitle}.md`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (e) {
      throw new Error(`Wiki page '${title}' not found.`);
    }
  }

  static async searchWiki(query: string) {
    try {
      const files = await fs.readdir(WIKI_DIR);
      const results: string[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await fs.readFile(path.join(WIKI_DIR, file), 'utf8');
        if (content.toLowerCase().includes(query.toLowerCase()) || file.includes(query.toLowerCase())) {
          results.push(`- **${file.replace('.md', '')}**: Coincidencia encontrada en el texto.`);
        }
      }
      
      return results.length > 0 ? results.join('\n') : `No se encontraron resultados en el Wiki para "${query}".`;
    } catch (e) {
      return `El Wiki está vacío o inaccesible.`;
    }
  }
}
