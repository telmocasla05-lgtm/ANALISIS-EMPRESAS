import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { createCategory, createCompany, createCompanyRule, createEmployee, createRole } from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await resetDatabase();
});

describe('flujo completo: PIN → ON → registros → OFF', () => {
  it('recorre el ciclo entero de una sesión de trabajo', async () => {
    const company = await createCompany({ name: 'Clínica Flujo' });
    const role = await createRole(company.id, 'Recepción');
    const employee = await createEmployee(company.id, role.id, { name: 'Trabajador', pin: '1234' });

    const categoriaEmail = await createCategory(company.id, 'Email');
    const categoriaHojas = await createCategory(company.id, 'Hojas de cálculo');
    await createCompanyRule(company.id, categoriaEmail.id, { patternType: 'APP', pattern: 'Outlook' });
    await createCompanyRule(company.id, categoriaHojas.id, { patternType: 'APP', pattern: 'Excel' });

    // 1. Pantalla de fichaje: lista de empleados de la empresa
    const list = await request(app).get(`/api/empresas/${company.slug}/empleados`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: employee.id, name: employee.name, avatarUrl: null }]);

    // 2. PIN incorrecto no autentica
    const badPin = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '0000' });
    expect(badPin.status).toBe(401);

    // 3. PIN correcto → token de sesión
    const login = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '1234' });
    expect(login.status).toBe(200);
    expect(login.body.employee).toMatchObject({ id: employee.id, name: 'Trabajador', companyId: company.id });
    const token = login.body.token as string;
    expect(typeof token).toBe('string');

    const auth = `Bearer ${token}`;

    // 4. ON abre la sesión de trabajo
    const on = await request(app).post('/api/sesiones/on').set('Authorization', auth).send({ device: 'DESKTOP' });
    expect(on.status).toBe(201);
    const sessionId = on.body.id as string;

    // 5. No se puede abrir una segunda sesión mientras la primera sigue activa
    const onAgain = await request(app).post('/api/sesiones/on').set('Authorization', auth).send({ device: 'DESKTOP' });
    expect(onAgain.status).toBe(409);

    // 6. La app de escritorio sube un lote de registros de tracking
    const base = Date.now();
    const registros = [
      { timestamp: new Date(base).toISOString(), app: 'Outlook' },
      { timestamp: new Date(base + 5_000).toISOString(), app: 'Excel' },
      { timestamp: new Date(base + 10_000).toISOString(), app: 'AplicaciónDesconocida' },
      { timestamp: new Date(base + 15_000).toISOString(), app: 'Excel', isIdle: true },
    ];
    const batch = await request(app).post(`/api/sesiones/${sessionId}/registros`).set('Authorization', auth).send({ registros });
    expect(batch.status).toBe(201);
    expect(batch.body).toEqual({ insertados: 4 });

    const stored = await prisma.activityRecord.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });
    expect(stored).toHaveLength(4);
    expect(stored[0]?.categoryId).toBe(categoriaEmail.id); // Outlook → Email
    expect(stored[1]?.categoryId).toBe(categoriaHojas.id); // Excel → Hojas de cálculo
    expect(stored[2]?.categoryId).toBeNull(); // sin regla que matchee → sin categorizar
    expect(stored[3]?.isIdle).toBe(true);
    expect(stored[3]?.categoryId).toBeNull(); // inactivo nunca se categoriza

    // 7. OFF cierra la sesión
    const off = await request(app).post(`/api/sesiones/${sessionId}/off`).set('Authorization', auth).send();
    expect(off.status).toBe(200);
    expect(off.body.id).toBe(sessionId);
    expect(off.body.endedAt).toBeTruthy();

    // 8. Cerrar una sesión ya cerrada es un conflicto, no un éxito silencioso
    const offAgain = await request(app).post(`/api/sesiones/${sessionId}/off`).set('Authorization', auth).send();
    expect(offAgain.status).toBe(409);

    const finalSession = await prisma.workSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(finalSession.endedAt).not.toBeNull();
  });

  it('rechaza acceder a los endpoints de sesión sin token', async () => {
    const res = await request(app).post('/api/sesiones/on').send({ device: 'DESKTOP' });
    expect(res.status).toBe(401);
  });
});
