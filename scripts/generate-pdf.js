/**
 * Script para converter o relatório técnico markdown em PDF
 * Utiliza Puppeteer e markdown-it para gerar um PDF bem formatado
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const MarkdownIt = require('markdown-it');

class PdfGenerator {
  constructor() {
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });
  }

  /**
   * Gera CSS para o PDF
   */
  generateCSS() {
    return `
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: white;
        }
        
        h1 {
          color: #2c3e50;
          border-bottom: 3px solid #3498db;
          padding-bottom: 10px;
          font-size: 24px;
          margin-top: 30px;
          margin-bottom: 20px;
        }
        
        h2 {
          color: #34495e;
          border-bottom: 2px solid #ecf0f1;
          padding-bottom: 8px;
          font-size: 18px;
          margin-top: 25px;
          margin-bottom: 15px;
        }
        
        h3 {
          color: #2c3e50;
          font-size: 16px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        
        h4 {
          color: #2c3e50;
          font-size: 14px;
          margin-top: 15px;
          margin-bottom: 8px;
        }
        
        p {
          margin-bottom: 12px;
          text-align: justify;
        }
        
        code {
          background-color: #f8f9fa;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 11px;
          color: #e74c3c;
        }
        
        pre {
          background-color: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 5px;
          padding: 15px;
          overflow-x: auto;
          margin: 15px 0;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 10px;
          line-height: 1.4;
        }
        
        pre code {
          background: none;
          padding: 0;
          color: #2c3e50;
        }
        
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
          font-size: 11px;
        }
        
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        
        th {
          background-color: #f2f2f2;
          font-weight: bold;
          color: #2c3e50;
        }
        
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        
        ul, ol {
          margin: 12px 0;
          padding-left: 25px;
        }
        
        li {
          margin-bottom: 6px;
        }
        
        strong {
          color: #2c3e50;
          font-weight: 600;
        }
        
        em {
          color: #7f8c8d;
          font-style: italic;
        }
        
        blockquote {
          border-left: 4px solid #3498db;
          padding-left: 15px;
          margin: 15px 0;
          color: #7f8c8d;
          font-style: italic;
        }
        
        .page-break {
          page-break-before: always;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 10px;
        }
        
        .header h1 {
          margin: 0;
          border: none;
          color: white;
          font-size: 28px;
        }
        
        .header p {
          margin: 10px 0 0 0;
          font-size: 14px;
          opacity: 0.9;
        }
        
        .footer {
          margin-top: 40px;
          padding: 20px;
          text-align: center;
          font-size: 10px;
          color: #7f8c8d;
          border-top: 1px solid #ecf0f1;
        }
        
        .toc {
          background-color: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 5px;
          padding: 20px;
          margin: 20px 0;
        }
        
        .toc h2 {
          margin-top: 0;
          color: #2c3e50;
          border: none;
        }
        
        .toc ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .toc a {
          color: #3498db;
          text-decoration: none;
        }
        
        .toc a:hover {
          text-decoration: underline;
        }
        
        @media print {
          body { 
            font-size: 11px; 
          }
          
          h1 { 
            font-size: 20px; 
            page-break-after: avoid;
          }
          
          h2 { 
            font-size: 16px; 
            page-break-after: avoid;
          }
          
          h3 { 
            font-size: 14px; 
            page-break-after: avoid;
          }
          
          pre, table { 
            page-break-inside: avoid; 
          }
          
          .header {
            background: #667eea !important;
            -webkit-print-color-adjust: exact;
          }
        }
      </style>
    `;
  }

  /**
   * Gera cabeçalho customizado
   */
  generateHeader() {
    return `
      <div class="header">
        <h1>Relatório Técnico</h1>
        <p>Sistema de Cache Write-Back - ESDB3 At2</p>
        <p>Implementação com Redis e PostgreSQL</p>
      </div>
    `;
  }

  /**
   * Gera índice
   */
  generateTOC(content) {
    const headings = content.match(/^#{1,3}\s+(.+)$/gm);
    if (!headings) return '';

    let toc = '<div class="toc"><h2>Índice</h2><ul>';
    
    headings.forEach(heading => {
      const level = (heading.match(/^#+/) || [''])[0].length;
      const text = heading.replace(/^#+\s+/, '');
      const id = text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      
      const indent = '  '.repeat(level - 1);
      toc += `${indent}<li><a href="#${id}">${text}</a></li>`;
    });
    
    toc += '</ul></div>';
    return toc;
  }

  /**
   * Adiciona IDs aos headers para navegação
   */
  addHeaderIds(html) {
    return html.replace(/<h([1-6])([^>]*)>([^<]+)<\/h([1-6])>/g, (match, level, attrs, text, closeLevel) => {
      const id = text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      return `<h${level}${attrs} id="${id}">${text}</h${closeLevel}>`;
    });
  }

  /**
   * Gera rodapé
   */
  generateFooter() {
    const date = new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return `
      <div class="footer">
        <p>Relatório gerado automaticamente em ${date}</p>
        <p>Sistema de Cache Write-Back - ESDB3 Módulo 2 - Atividade 2</p>
      </div>
    `;
  }

  /**
   * Converte markdown para HTML
   */
  markdownToHtml(markdownContent) {
    // Gera o HTML básico do markdown
    let html = this.md.render(markdownContent);
    
    // Adiciona IDs aos headers
    html = this.addHeaderIds(html);
    
    // Gera TOC
    const toc = this.generateTOC(markdownContent);
    
    // Monta o HTML completo
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatório Técnico - Sistema de Cache Write-Back</title>
        ${this.generateCSS()}
      </head>
      <body>
        ${this.generateHeader()}
        ${toc}
        <div class="page-break"></div>
        ${html}
        ${this.generateFooter()}
      </body>
      </html>
    `;
    
    return fullHtml;
  }

  /**
   * Gera PDF usando Puppeteer
   */
  async generatePdf(htmlContent, outputPath) {
    console.log('🚀 Iniciando geração do PDF...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Define o conteúdo HTML
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });
      
      // Gera o PDF
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>
        `
      });
      
      console.log(`✅ PDF gerado com sucesso: ${outputPath}`);
      
    } finally {
      await browser.close();
    }
  }

  /**
   * Método principal para gerar PDF do relatório
   */
  async generateReport(markdownPath, outputPath) {
    try {
      console.log(`📖 Lendo arquivo markdown: ${markdownPath}`);
      
      // Lê o arquivo markdown
      const markdownContent = fs.readFileSync(markdownPath, 'utf8');
      
      console.log('🔄 Convertendo markdown para HTML...');
      
      // Converte para HTML
      const htmlContent = this.markdownToHtml(markdownContent);
      
      console.log('📄 Gerando PDF...');
      
      // Gera o PDF
      await this.generatePdf(htmlContent, outputPath);
      
      // Verifica se o arquivo foi criado
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`📊 Arquivo PDF criado: ${(stats.size / 1024).toFixed(1)} KB`);
        return true;
      } else {
        throw new Error('Arquivo PDF não foi criado');
      }
      
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      throw error;
    }
  }
}

// Executa a geração se este arquivo for chamado diretamente
if (require.main === module) {
  const generator = new PdfGenerator();
  
  const markdownPath = path.join(__dirname, '..', 'docs', 'relatorio-tecnico.md');
  const outputPath = path.join(__dirname, '..', 'docs', 'relatorio-tecnico.pdf');
  
  generator.generateReport(markdownPath, outputPath)
    .then(() => {
      console.log('\\n🎉 Relatório PDF gerado com sucesso!');
      console.log(`📁 Localização: ${outputPath}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\\n💥 Falha na geração do PDF:', error.message);
      process.exit(1);
    });
}

module.exports = PdfGenerator;
