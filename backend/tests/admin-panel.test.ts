import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import {
  createAdminUser,
  createCategory,
  createCompany,
  createEmployee,
  createRecords,
  createRole,
  createSession,
} from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';
import { getWeekRange } from '../src/services/resumen.js';
import { AdminRole } from '../src/generated/prisma/client.js';

beforeEach(async () => {
  await resetDatabase();
});

async function loginAdmin(email: string, password = 'secreto123'): Promise<string> {
  const res = await request(app).post('/api/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('listado de empresas del panel', () => {
  it('SUPERADMIN ve todas las empresas y CLIENTE solo la suya', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    await createAdminUser({ email: 'cliente-a@test.dev', password: 'secreto123', role: AdminRole.CLIENTE, companyId: companyA.id });

    const tokenSuper = await loginAdmin('super@test.dev');
    const resSuper = await request(app).get('/api/admin/empresas').set('Authorization', `Bearer ${tokenSuper}`);
    expect(resSuper.status).toBe(200);
    expect(resSuper.body).toHaveLength(2);

    const tokenCliente = await loginAdmin('cliente-a@test.dev');
    const resCliente = await request(app).get('/api/admin/empresas').set('Authorization', `Bearer ${tokenCliente}`);
    expect(resCliente.status).toBe(200);
    expect(resCliente.body).toHaveLength(1);
    expect(resCliente.body[0].id).toBe(companyA.id);
  });
});

describe('ajustes de empresa', () => {
  it('devuelve el detalle, actualiza los ajustes y el login PIN refleja el muestreo nuevo', async () => {
    const company = await createCompany({ name: 'Clínica Ajustes' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const detalle = await request(app).get(`/api/admin/empresas/${company.id}`).set('Authorization', `Bearer ${token}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.avgHourlyCostCents).toBe(2000);
    expect(detalle.body.sampleIntervalSeconds).toBe(5);

    const put = await request(app)
      .put(`/api/admin/empresas/${company.id}/ajustes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ avgHourlyCostCents: 2500, inactivityMinutes: 15, sampleIntervalSeconds: 8 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ avgHourlyCostCents: 2500, inactivityMinutes: 15, sampleIntervalSeconds: 8 });

    const login = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '1111' });
    expect(login.status).toBe(200);
    expect(login.body.inactivityMinutes).toBe(15);
    expect(login.body.sampleIntervalSeconds).toBe(8);
  });

  it('rechaza valores fuera de rango', async () => {
    const company = await createCompany({ name: 'Clínica Validación' });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    for (const body of [
      { sampleIntervalSeconds: 3 },
      { sampleIntervalSeconds: 11 },
      { inactivityMinutes: 0 },
      { avgHourlyCostCents: -5 },
      { avgHourlyCostCents: 20.5 },
    ]) {
      const res = await request(app)
        .put(`/api/admin/empresas/${company.id}/ajustes`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('un CLIENTE no puede leer ni cambiar los ajustes de otra empresa', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'cliente-a@test.dev', password: 'secreto123', role: AdminRole.CLIENTE, companyId: companyA.id });
    const token = await loginAdmin('cliente-a@test.dev');

    const get = await request(app).get(`/api/admin/empresas/${companyB.id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(403);
    const put = await request(app)
      .put(`/api/admin/empresas/${companyB.id}/ajustes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ inactivityMinutes: 5 });
    expect(put.status).toBe(403);
  });
});

describe('resumen por rango de fechas', () => {
  it('solo agrega los registros dentro del rango desde/hasta (inclusive)', async () => {
    const company = await createCompany({ name: 'Clínica Rango' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const dentro = new Date('2026-07-01T09:00:00Z');
    const fuera = new Date('2026-07-08T09:00:00Z');
    const s1 = await createSession(company.id, employee.id, { startedAt: dentro, endedAt: new Date('2026-07-01T10:00:00Z') });
    const s2 = await createSession(company.id, employee.id, { startedAt: fuera, endedAt: new Date('2026-07-08T10:00:00Z') });
    // 120 lecturas cada 5 s → (119×5 + 10) s = 605 s = 0.17 h
    const entries = Array.from({ length: 120 }, () => ({ app: 'Outlook', categoryId: category.id }));
    await createRecords(company.id, s1.id, dentro, entries);
    await createRecords(company.id, s2.id, fuera, entries);

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/resumen?desde=2026-07-01&hasta=2026-07-07`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.porCategoria).toHaveLength(1);
    expect(res.body.porCategoria[0].horas).toBeCloseTo(0.17, 2);
    // coste = horas × 20 €/h
    expect(res.body.porCategoria[0].costeEstimado).toBeCloseTo(3.4, 1);
  });

  it('devuelve 400 si el rango es inválido', async () => {
    const company = await createCompany({ name: 'Clínica Rango Malo' });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/resumen?desde=2026-07-07&hasta=2026-07-01`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('evolución semanal', () => {
  it('devuelve una entrada por semana y las horas caen en la semana correcta', async () => {
    const company = await createCompany({ name: 'Clínica Evolución' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    // Miércoles 12:00 de la semana actual, para que las lecturas no crucen de semana.
    const { start: semanaActual } = getWeekRange();
    const enSemanaActual = new Date(semanaActual.getTime() + (2 * 24 + 12) * 3600 * 1000);
    const haceDosSemanas = new Date(enSemanaActual.getTime() - 14 * 24 * 3600 * 1000);
    const s1 = await createSession(company.id, employee.id, { startedAt: haceDosSemanas, endedAt: haceDosSemanas });
    const s2 = await createSession(company.id, employee.id, { startedAt: enSemanaActual, endedAt: null });
    const entries = Array.from({ length: 120 }, () => ({ app: 'Outlook', categoryId: category.id }));
    await createRecords(company.id, s1.id, haceDosSemanas, entries);
    await createRecords(company.id, s2.id, enSemanaActual, entries);

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/evolucion?semanas=4`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);

    const conHoras = (res.body as Array<{ horas: number }>).map((s) => s.horas);
    // Semana actual (última) y la de hace dos semanas (antepenúltima) tienen horas.
    expect(conHoras[3]).toBeCloseTo(0.17, 2);
    expect(conHoras[1]).toBeCloseTo(0.17, 2);
    expect(conHoras[0]).toBe(0);
    expect(conHoras[2]).toBe(0);
  });
});

describe('registros sin categorizar', () => {
  it('agrupa por app+dominio, excluye categorizados e inactividad y ordena por horas', async () => {
    const company = await createCompany({ name: 'Clínica SinCat' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const inicio = new Date('2026-07-06T09:00:00Z');
    const session = await createSession(company.id, employee.id, { startedAt: inicio, endedAt: null });
    await createRecords(company.id, session.id, inicio, [
      ...Array.from({ length: 10 }, () => ({ app: 'Chrome', domain: 'app-desconocida.com', windowTitle: 'Panel misterioso' })),
      ...Array.from({ length: 5 }, () => ({ app: 'AppRara' })),
      ...Array.from({ length: 5 }, () => ({ app: 'Outlook', categoryId: category.id })),
      ...Array.from({ length: 3 }, () => ({ app: 'Chrome', isIdle: true })),
    ]);

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/sin-categorizar?desde=2026-07-06&hasta=2026-07-06`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].app).toBe('Chrome');
    expect(res.body[0].domain).toBe('app-desconocida.com');
    expect(res.body[0].registros).toBe(10);
    expect(res.body[0].windowTitleEjemplo).toBe('Panel misterioso');
    expect(res.body[1].app).toBe('AppRara');
    expect(res.body[1].registros).toBe(5);
  });
});

describe('sesiones (registro horario)', () => {
  it('lista sesiones con duración y estado, y filtra por empleado', async () => {
    const company = await createCompany({ name: 'Clínica Sesiones' });
    const role = await createRole(company.id);
    const emp1 = await createEmployee(company.id, role.id, { name: 'Ana', pin: '1111' });
    const emp2 = await createEmployee(company.id, role.id, { name: 'Berta', pin: '2222' });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    await createSession(company.id, emp1.id, {
      startedAt: new Date('2026-07-06T08:00:00Z'),
      endedAt: new Date('2026-07-06T10:00:00Z'),
    });
    await createSession(company.id, emp1.id, { startedAt: new Date('2026-07-07T08:00:00Z'), endedAt: null });
    await createSession(company.id, emp2.id, {
      startedAt: new Date('2026-07-07T09:00:00Z'),
      endedAt: new Date('2026-07-07T16:30:00Z'),
    });
    // Fuera de rango: no debe aparecer.
    await createSession(company.id, emp1.id, {
      startedAt: new Date('2026-06-01T08:00:00Z'),
      endedAt: new Date('2026-06-01T09:00:00Z'),
    });

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/sesiones?desde=2026-07-06&hasta=2026-07-12`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    const abierta = res.body.find((s: { endedAt: string | null }) => s.endedAt === null);
    expect(abierta.duracionHoras).toBeNull();
    const deAna = res.body.filter((s: { employeeName: string }) => s.employeeName === 'Ana');
    expect(deAna.some((s: { duracionHoras: number | null }) => s.duracionHoras === 2)).toBe(true);

    const filtrado = await request(app)
      .get(`/api/admin/empresas/${company.id}/sesiones?desde=2026-07-06&hasta=2026-07-12&employeeId=${emp2.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(filtrado.body).toHaveLength(1);
    expect(filtrado.body[0].employeeName).toBe('Berta');
    expect(filtrado.body[0].duracionHoras).toBe(7.5);
  });
});

describe('categorías visibles para la empresa', () => {
  it('lista las de sector (solo lectura) y las propias, con su scope', async () => {
    const company = await createCompany({ name: 'Clínica Categorías' });
    await createCategory(company.id, 'Propia de la empresa');
    await prisma.category.create({ data: { sector: company.sector, name: 'De la plantilla del sector' } });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/categorias`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const byName = new Map((res.body as Array<{ name: string; scope: string }>).map((c) => [c.name, c.scope]));
    expect(byName.get('Propia de la empresa')).toBe('empresa');
    expect(byName.get('De la plantilla del sector')).toBe('sector');
  });
});

describe('recategorización al crear una regla', () => {
  it('aplica la regla nueva a los registros sin categorizar de la empresa (y solo a ellos)', async () => {
    const company = await createCompany({ name: 'Clínica Recat' });
    const otra = await createCompany({ name: 'Clínica Ajena' });
    const role = await createRole(company.id);
    const roleOtra = await createRole(otra.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    const employeeOtra = await createEmployee(otra.id, roleOtra.id, { name: 'Ajena', pin: '2222' });
    const category = await createCategory(company.id, 'Sistema de gestión');
    const otraCategoria = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const inicio = new Date('2026-07-06T09:00:00Z');
    const session = await createSession(company.id, employee.id, { startedAt: inicio, endedAt: null });
    const sessionOtra = await createSession(otra.id, employeeOtra.id, { startedAt: inicio, endedAt: null });
    await createRecords(company.id, session.id, inicio, [
      ...Array.from({ length: 5 }, () => ({ app: 'GestionClinicaX' })),
      { app: 'GestionClinicaX', categoryId: otraCategoria.id }, // ya categorizado: no se toca
      { app: 'GestionClinicaX', isIdle: true }, // inactividad: no se toca
      { app: 'OtraApp' },
    ]);
    await createRecords(otra.id, sessionOtra.id, inicio, [{ app: 'GestionClinicaX' }]);

    const res = await request(app)
      .post(`/api/admin/empresas/${company.id}/reglas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patternType: 'APP', pattern: 'gestionclinicax', categoryId: category.id, recategorizar: true });
    expect(res.status).toBe(201);
    expect(res.body.recategorizados).toBe(5);

    const recategorizados = await prisma.activityRecord.count({ where: { companyId: company.id, categoryId: category.id } });
    expect(recategorizados).toBe(5);
    // El registro ya categorizado conserva su categoría y la otra empresa queda intacta.
    expect(await prisma.activityRecord.count({ where: { companyId: company.id, categoryId: otraCategoria.id } })).toBe(1);
    expect(await prisma.activityRecord.count({ where: { companyId: otra.id, categoryId: { not: null } } })).toBe(0);
  });

  it('sin recategorizar no toca el histórico', async () => {
    const company = await createCompany({ name: 'Clínica NoRecat' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleada', pin: '1111' });
    const category = await createCategory(company.id, 'Sistema de gestión');
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const inicio = new Date('2026-07-06T09:00:00Z');
    const session = await createSession(company.id, employee.id, { startedAt: inicio, endedAt: null });
    await createRecords(company.id, session.id, inicio, [{ app: 'GestionClinicaX' }]);

    const res = await request(app)
      .post(`/api/admin/empresas/${company.id}/reglas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patternType: 'APP', pattern: 'GestionClinicaX', categoryId: category.id });
    expect(res.status).toBe(201);
    expect(res.body.recategorizados).toBe(0);
    expect(await prisma.activityRecord.count({ where: { companyId: company.id, categoryId: { not: null } } })).toBe(0);
  });
});
