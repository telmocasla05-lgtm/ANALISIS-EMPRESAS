import { describe, expect, it } from 'vitest';
import { categorizeRecord, type RuleSet } from '../src/services/categorization.js';

describe('motor de categorización (función pura)', () => {
  const rules: RuleSet = {
    companyRules: [{ patternType: 'APP', pattern: 'GestionClinicaX', categoryId: 'cat-empresa' }],
    sectorRules: [
      { patternType: 'APP', pattern: 'Excel', categoryId: 'cat-hojas' },
      { patternType: 'DOMAIN', pattern: 'mail.google.com', categoryId: 'cat-email' },
      { patternType: 'TITLE', pattern: 'factura', categoryId: 'cat-facturas' },
    ],
  };

  it('prioriza las reglas de empresa sobre las de sector', () => {
    const categoryId = categorizeRecord({ app: 'GestionClinicaX' }, rules);
    expect(categoryId).toBe('cat-empresa');
  });

  it('cae a las reglas de sector si no hay match de empresa', () => {
    const categoryId = categorizeRecord({ app: 'Microsoft Excel' }, rules);
    expect(categoryId).toBe('cat-hojas');
  });

  it('matchea por dominio cuando el patternType es DOMAIN', () => {
    const categoryId = categorizeRecord({ app: 'Chrome', domain: 'mail.google.com' }, rules);
    expect(categoryId).toBe('cat-email');
  });

  it('matchea por título de ventana cuando el patternType es TITLE', () => {
    const categoryId = categorizeRecord({ app: 'Chrome', windowTitle: 'Factura_Enero.pdf' }, rules);
    expect(categoryId).toBe('cat-facturas');
  });

  it('el matching es case-insensitive', () => {
    const categoryId = categorizeRecord({ app: 'EXCEL' }, rules);
    expect(categoryId).toBe('cat-hojas');
  });

  it('devuelve null (sin categorizar) si ninguna regla coincide', () => {
    const categoryId = categorizeRecord({ app: 'AplicaciónDesconocida' }, rules);
    expect(categoryId).toBeNull();
  });
});
