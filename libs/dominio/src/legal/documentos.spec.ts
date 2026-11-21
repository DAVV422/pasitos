import { CONFIG_LEGAL } from './config';
import { CORREO_POR_PUBLICAR, formatFechaLegal, getDocumentoLegal } from './documentos';

const CONFIG = { ...CONFIG_LEGAL, correoContacto: '', correoPrivacidad: '' };

describe('términos y privacidad (HU-407)', () => {
  it('completa las marcas con la configuración, sin dejar ninguna', () => {
    const terminos = getDocumentoLegal('terminos', {
      ...CONFIG,
      correoContacto: 'hola@example.com',
    });
    expect(terminos.html).toContain('<a href="mailto:hola@example.com">hola@example.com</a>');
    expect(terminos.html).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(getDocumentoLegal('privacidad', CONFIG).html).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it('un correo vacío se muestra como pendiente', () => {
    const privacidad = getDocumentoLegal('privacidad', CONFIG);
    expect(privacidad.html).toContain(CORREO_POR_PUBLICAR);
    expect(privacidad.html).not.toContain('mailto:');
  });

  it('no queda nada interno: ni [Completar], ni el anexo, ni los textos cortos de la app', () => {
    for (const tipo of ['terminos', 'privacidad'] as const) {
      const { html, titulo, version } = getDocumentoLegal(tipo, CONFIG);
      expect(html).not.toContain('[Completar');
      expect(html).not.toContain('Anexo');
      expect(html).not.toContain('Textos cortos');
      expect(html).not.toContain('.md');
      expect(titulo).toMatch(/Pasitos$/);
      // HU-411: la privacidad pasó a la 1.2 (el celular); los términos siguen en la 1.1.
      expect(version).toBe(tipo === 'privacidad' ? 'piloto 1.2' : 'piloto 1.1');
    }
  });

  it('los enlaces entre documentos van a sus páginas, con anclas que existen', () => {
    const terminos = getDocumentoLegal('terminos', CONFIG).html;
    const privacidad = getDocumentoLegal('privacidad', CONFIG).html;
    for (const [, ancla] of terminos.matchAll(/href="\/privacidad#([^"]+)"/g)) {
      expect(privacidad).toContain(`id="${ancla}"`);
    }
  });

  it('la fecha va como dd/mm/aaaa y el correo se escapa', () => {
    expect(formatFechaLegal('2026-11-19')).toBe('19/11/2026');
    const html = getDocumentoLegal('terminos', {
      ...CONFIG,
      correoContacto: 'a"b@example.com',
    }).html;
    expect(html).toContain('a&quot;b@example.com');
  });
});
