// Selección activa de la tablet: GET /api/categorias (botones por empresa/sector)
// y registros con categoryId explícito, que se aplica sin pasar por las reglas.
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { createCategory, createCompany, createCompanyRule, createEmployee, createRole } from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';
import { Sector } from '../src/generated/prisma/client.js';

beforeEach(async () => {
  await resetDatabase();
});

async function loginEmployee(companyName: string, pin = '1234') {
  const company = await createCompany({ name: companyName });
  const role = await createRole(company.id, 'Recepción');
  const employee = await createEmployee(company.id, role.id, { name: 'Empleado Tablet', pin });
  const login = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin });
  expect(login.status).toBe(200);
  return { company, employee, auth: `Bearer ${login.body.token as string}` };
}

describe('GET /api/categorias (token de empleado)', () => {
  it('devuelve las categorías de la empresa y las de su sector, sin las de otros tenants', async () => {
    const { company, auth } = await loginEmployee('Clínica Botones');
    const propia = await createCategory(company.id, 'Recepción presencial');
    const deSector = await prisma.category.create({ data: { sector: Sector.CLINICA, name: 'Email' } });

    // Ruido de otros tenants: ni la categoría de otra empresa ni la de otro sector deben salir
    const otra = await createCompany({ name: 'Otra Clínica' });
    await createCategory(otra.id, 'Categoría ajena');
    await prisma.category.create({ data: { sector: Sector.GESTORIA, name: 'Contabilidad' } });

    const res = await request(app).get('/api/categorias').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: deSector.id, name: 'Email' },
      { id: propia.id, name: 'Recepción presencial' },
    ]);
  });

  it('rechaza la petición sin token de empleado', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sesiones/:id/registros con categoryId explícito', () => {
  it('aplica la categoría elegida tal cual, saltándose las reglas', async () => {
    const { company, auth } = await loginEmployee('Clínica Tablet');
    const llamadas = await createCategory(company.id, 'Llamadas');
    const email = await createCategory(company.id, 'Email');
    // Regla que categorizaría este registro como Email si no llegara categoryId
    await createCompanyRule(company.id, email.id, { patternType: 'APP', pattern: 'Selección activa' });

    const on = await request(app).post('/api/sesiones/on').set('Authorization', auth).send({ device: 'TABLET' });
    expect(on.status).toBe(201);
    const sessionId = on.body.id as string;

    const base = Date.now();
    const registros = [
      { timestamp: new Date(base).toISOString(), app: 'Selección activa', windowTitle: 'Llamadas', categoryId: llamadas.id },
      { timestamp: new Date(base + 5_000).toISOString(), app: 'Selección activa' }, // sin categoryId → reglas
    ];
    const batch = await request(app)
      .post(`/api/sesiones/${sessionId}/registros`)
      .set('Authorization', auth)
      .send({ registros });
    expect(batch.status).toBe(201);

    const stored = await prisma.activityRecord.findMany({ where: { sessionId }, orderBy: { timestamp: 'asc' } });
    expect(stored[0]?.categoryId).toBe(llamadas.id); // explícito gana a la regla
    expect(stored[1]?.categoryId).toBe(email.id); // sin explícito, siguen aplicando las reglas
  });

  it('rechaza un categoryId de otra empresa sin insertar nada', async () => {
    const { auth } = await loginEmployee('Clínica Válida');
    const otra = await createCompany({ name: 'Clínica Intrusa' });
    const ajena = await createCategory(otra.id, 'Categoría ajena');

    const on = await request(app).post('/api/sesiones/on').set('Authorization', auth).send({ device: 'TABLET' });
    const sessionId = on.body.id as string;

    const batch = await request(app)
      .post(`/api/sesiones/${sessionId}/registros`)
      .set('Authorization', auth)
      .send({ registros: [{ timestamp: new Date().toISOString(), app: 'Selección activa', categoryId: ajena.id }] });
    expect(batch.status).toBe(400);
    expect(await prisma.activityRecord.count({ where: { sessionId } })).toBe(0);
  });

  it('un registro inactivo nunca guarda categoría, aunque llegue categoryId', async () => {
    const { company, auth } = await loginEmployee('Clínica Idle');
    const llamadas = await createCategory(company.id, 'Llamadas');

    const on = await request(app).post('/api/sesiones/on').set('Authorization', auth).send({ device: 'TABLET' });
    const sessionId = on.body.id as string;

    const batch = await request(app)
      .post(`/api/sesiones/${sessionId}/registros`)
      .set('Authorization', auth)
      .send({
        registros: [
          { timestamp: new Date().toISOString(), app: 'Selección activa', categoryId: llamadas.id, isIdle: true },
        ],
      });
    expect(batch.status).toBe(201);

    const stored = await prisma.activityRecord.findFirstOrThrow({ where: { sessionId } });
    expect(stored.isIdle).toBe(true);
    expect(stored.categoryId).toBeNull();
  });
});
