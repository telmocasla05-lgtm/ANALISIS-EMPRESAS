import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import {
  createAdminUser,
  createCategory,
  createCompany,
  createCompanyRule,
  createEmployee,
  createRole,
} from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';
import { AdminRole } from '../src/generated/prisma/client.js';

beforeEach(async () => {
  await resetDatabase();
});

describe('aislamiento multi-tenant', () => {
  it('la lista de empleados de una empresa nunca incluye empleados de otra', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    const roleA = await createRole(companyA.id);
    const roleB = await createRole(companyB.id);
    await createEmployee(companyA.id, roleA.id, { name: 'Empleado A', pin: '1111' });
    await createEmployee(companyB.id, roleB.id, { name: 'Empleado B', pin: '2222' });

    const res = await request(app).get(`/api/empresas/${companyA.slug}/empleados`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Empleado A');
  });

  it('el token de sesión de un empleado no permite operar sobre la sesión de otro empleado', async () => {
    const company = await createCompany({ name: 'Clínica Compartida' });
    const role = await createRole(company.id);
    const empleado1 = await createEmployee(company.id, role.id, { name: 'Empleado 1', pin: '1111' });
    const empleado2 = await createEmployee(company.id, role.id, { name: 'Empleado 2', pin: '2222' });

    const login1 = await request(app).post('/api/auth/pin').send({ employeeId: empleado1.id, pin: '1111' });
    const login2 = await request(app).post('/api/auth/pin').send({ employeeId: empleado2.id, pin: '2222' });

    const on1 = await request(app)
      .post('/api/sesiones/on')
      .set('Authorization', `Bearer ${login1.body.token}`)
      .send({ device: 'DESKTOP' });
    expect(on1.status).toBe(201);
    const sessionId = on1.body.id as string;

    // Empleado 2 intenta cerrar/alimentar la sesión de empleado 1 con su propio token.
    const offAttempt = await request(app)
      .post(`/api/sesiones/${sessionId}/off`)
      .set('Authorization', `Bearer ${login2.body.token}`)
      .send();
    expect(offAttempt.status).toBe(404);

    const registrosAttempt = await request(app)
      .post(`/api/sesiones/${sessionId}/registros`)
      .set('Authorization', `Bearer ${login2.body.token}`)
      .send({ registros: [{ timestamp: new Date().toISOString(), app: 'Intruso' }] });
    expect(registrosAttempt.status).toBe(404);
  });

  it('un admin CLIENTE de una empresa no puede ver el resumen de otra empresa, pero SUPERADMIN sí', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'admin-a@test.dev', password: 'secreto123', role: AdminRole.CLIENTE, companyId: companyA.id });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });

    const loginCliente = await request(app).post('/api/admin/auth/login').send({ email: 'admin-a@test.dev', password: 'secreto123' });
    const tokenCliente = loginCliente.body.token as string;

    const resPropia = await request(app).get(`/api/admin/empresas/${companyA.id}/resumen`).set('Authorization', `Bearer ${tokenCliente}`);
    expect(resPropia.status).toBe(200);

    const resAjena = await request(app).get(`/api/admin/empresas/${companyB.id}/resumen`).set('Authorization', `Bearer ${tokenCliente}`);
    expect(resAjena.status).toBe(403);

    const loginSuper = await request(app).post('/api/admin/auth/login').send({ email: 'super@test.dev', password: 'secreto123' });
    const tokenSuper = loginSuper.body.token as string;

    const resB = await request(app).get(`/api/admin/empresas/${companyB.id}/resumen`).set('Authorization', `Bearer ${tokenSuper}`);
    expect(resB.status).toBe(200);
  });

  it('no se puede asignar a un empleado un rol de otra empresa desde el admin', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    const roleB = await createRole(companyB.id);
    await createAdminUser({ email: 'super2@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });

    const login = await request(app).post('/api/admin/auth/login').send({ email: 'super2@test.dev', password: 'secreto123' });
    const token = login.body.token as string;

    const res = await request(app)
      .post(`/api/admin/empresas/${companyA.id}/empleados`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Intruso', roleId: roleB.id, pin: '9999' });

    expect(res.status).toBe(400);
  });

  it('las reglas de categorización propias de una empresa no afectan a otra empresa del mismo sector', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    const roleA = await createRole(companyA.id);
    const roleB = await createRole(companyB.id);
    const empleadoA = await createEmployee(companyA.id, roleA.id, { name: 'A', pin: '1111' });
    const empleadoB = await createEmployee(companyB.id, roleB.id, { name: 'B', pin: '2222' });

    const categoriaA = await createCategory(companyA.id, 'Categoría Exclusiva A');
    await createCompanyRule(companyA.id, categoriaA.id, { patternType: 'APP', pattern: 'HerramientaInterna' });

    const loginA = await request(app).post('/api/auth/pin').send({ employeeId: empleadoA.id, pin: '1111' });
    const loginB = await request(app).post('/api/auth/pin').send({ employeeId: empleadoB.id, pin: '2222' });

    const onA = await request(app).post('/api/sesiones/on').set('Authorization', `Bearer ${loginA.body.token}`).send({ device: 'DESKTOP' });
    const onB = await request(app).post('/api/sesiones/on').set('Authorization', `Bearer ${loginB.body.token}`).send({ device: 'DESKTOP' });

    await request(app)
      .post(`/api/sesiones/${onA.body.id}/registros`)
      .set('Authorization', `Bearer ${loginA.body.token}`)
      .send({ registros: [{ timestamp: new Date().toISOString(), app: 'HerramientaInterna' }] });

    await request(app)
      .post(`/api/sesiones/${onB.body.id}/registros`)
      .set('Authorization', `Bearer ${loginB.body.token}`)
      .send({ registros: [{ timestamp: new Date().toISOString(), app: 'HerramientaInterna' }] });

    const recordA = await prisma.activityRecord.findFirst({ where: { sessionId: onA.body.id } });
    const recordB = await prisma.activityRecord.findFirst({ where: { sessionId: onB.body.id } });

    expect(recordA?.categoryId).toBe(categoriaA.id);
    expect(recordB?.categoryId).toBeNull(); // sin regla propia ni de sector que matchee "HerramientaInterna"
  });

  it('los registros de tracking quedan aislados por empresa a nivel de BD (companyId denormalizado)', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    const roleA = await createRole(companyA.id);
    const empleadoA = await createEmployee(companyA.id, roleA.id, { name: 'A', pin: '1111' });

    const loginA = await request(app).post('/api/auth/pin').send({ employeeId: empleadoA.id, pin: '1111' });
    const onA = await request(app).post('/api/sesiones/on').set('Authorization', `Bearer ${loginA.body.token}`).send({ device: 'DESKTOP' });
    await request(app)
      .post(`/api/sesiones/${onA.body.id}/registros`)
      .set('Authorization', `Bearer ${loginA.body.token}`)
      .send({ registros: [{ timestamp: new Date().toISOString(), app: 'Excel' }] });

    const recordsForB = await prisma.activityRecord.findMany({ where: { companyId: companyB.id } });
    expect(recordsForB).toHaveLength(0);

    const recordsForA = await prisma.activityRecord.findMany({ where: { companyId: companyA.id } });
    expect(recordsForA).toHaveLength(1);
  });
});
