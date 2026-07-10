import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { InformeDatos } from '@digital-power/shared';
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
import { buildInformeDatos } from '../src/services/informe-datos.js';
import { generarBorradorInforme } from '../src/services/informe-claude.js';
import { AdminRole, Sector } from '../src/generated/prisma/client.js';

// La API de Claude no se llama en tests: se mockea el módulo de redacción.
vi.mock('../src/services/informe-claude.js', () => ({
  INFORME_MODEL: 'claude-sonnet-5',
  generarBorradorInforme: vi.fn(async () => ({
    content: '## Resumen ejecutivo\n\nBorrador de prueba.',
    model: 'claude-sonnet-5',
  })),
}));

const generarMock = vi.mocked(generarBorradorInforme);

beforeEach(async () => {
  await resetDatabase();
  generarMock.mockClear();
});

async function loginAdmin(email: string, password = 'secreto123'): Promise<string> {
  const res = await request(app).post('/api/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

// Empresa con 1 h de actividad el 2026-07-01 (720 lecturas cada 5 s): mitad
// Email, cuarto sin categorizar, cuarto inactivo. Coste/hora 20 €.
async function setupCompanyWithActivity() {
  const company = await createCompany({ name: 'Clínica Informes' });
  const role = await createRole(company.id);
  const employee = await createEmployee(company.id, role.id, { name: 'Empleada Uno', pin: '1111' });
  const category = await createCategory(company.id, 'Email');
  const session = await createSession(company.id, employee.id, {
    startedAt: new Date('2026-07-01T09:00:00Z'),
    endedAt: new Date('2026-07-01T10:00:00Z'),
  });
  const entries = Array.from({ length: 720 }, (_, i) => {
    if (i < 360) return { app: 'Outlook', categoryId: category.id };
    if (i < 540) return { app: 'Desconocida' };
    return { app: 'Desconocida', isIdle: true };
  });
  await createRecords(company.id, session.id, new Date('2026-07-01T09:00:00Z'), entries);
  await prisma.automationTemplate.createMany({
    data: [
      { sector: Sector.CLINICA, title: 'Recordatorios de cita', description: 'WhatsApp automático', sortOrder: 1 },
      { sector: Sector.CLINICA, title: 'Triaje de email', description: 'Respuestas automáticas', sortOrder: 2 },
      { sector: Sector.CLINICA, title: 'Volcado de hojas', description: 'Sincronización con gestión', sortOrder: 3 },
    ],
  });
  return { company, employee, category };
}

describe('agregación de datos del informe (buildInformeDatos)', () => {
  it('calcula horas y coste por categoría, empleado y semana, y adjunta las plantillas del sector', async () => {
    const { company, employee, category } = await setupCompanyWithActivity();

    const datos: InformeDatos = await buildInformeDatos(company.id, {
      start: new Date('2026-07-01T00:00:00Z'),
      end: new Date('2026-07-08T00:00:00Z'),
    });

    expect(datos.empresa).toEqual({ nombre: 'Clínica Informes', sector: 'CLINICA', costeHoraEuros: 20 });
    expect(datos.totales.horas).toBe(1);
    expect(datos.totales.costeEstimado).toBe(20);

    const porNombre = new Map(datos.porCategoria.map((c) => [c.categoryName, c]));
    expect(porNombre.get('Email')).toMatchObject({ categoryId: category.id, horas: 0.5, costeEstimado: 10 });
    expect(porNombre.get('Sin categorizar / revisar')?.horas).toBe(0.25);
    expect(porNombre.get('Inactivo / pausa')?.horas).toBe(0.25);
    // Ordenado por horas descendente: la categoría con más tiempo va primero.
    expect(datos.porCategoria[0]!.categoryName).toBe('Email');

    expect(datos.porEmpleado).toHaveLength(1);
    expect(datos.porEmpleado[0]).toMatchObject({ employeeId: employee.id, horas: 1, costeEstimado: 20 });

    // El periodo cruza dos semanas naturales, recortadas a sus bordes.
    expect(datos.porSemana).toHaveLength(2); // 1-5 jul (semana del 29 jun) + 6-7 jul (semana del 6 jul)
    expect(datos.porSemana[0]!.horas).toBe(1);
    expect(datos.porSemana[1]!.horas).toBe(0);

    expect(datos.plantillasAutomatizacion.map((p) => p.title)).toEqual([
      'Recordatorios de cita',
      'Triaje de email',
      'Volcado de hojas',
    ]);
  });
});

describe('POST /api/admin/empresas/:id/informes', () => {
  it('genera el borrador con los datos agregados y lo guarda en estado BORRADOR', async () => {
    const { company } = await setupCompanyWithActivity();
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const res = await request(app)
      .post(`/api/admin/empresas/${company.id}/informes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ desde: '2026-07-01', hasta: '2026-07-07' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('BORRADOR');
    expect(res.body.content).toContain('Resumen ejecutivo');
    expect(res.body.model).toBe('claude-sonnet-5');

    // El generador recibe el JSON agregado completo (datos + plantillas del sector).
    expect(generarMock).toHaveBeenCalledTimes(1);
    const datos = generarMock.mock.calls[0]![0];
    expect(datos.totales.horas).toBe(1);
    expect(datos.plantillasAutomatizacion).toHaveLength(3);

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.companyId).toBe(company.id);
    expect(stored.draftContent).toBe(stored.content);
  });

  it('rechaza periodos sin actividad y rangos inválidos sin llamar a la API', async () => {
    const { company } = await setupCompanyWithActivity();
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');

    const vacio = await request(app)
      .post(`/api/admin/empresas/${company.id}/informes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ desde: '2026-01-01', hasta: '2026-01-07' });
    expect(vacio.status).toBe(400);

    const invalido = await request(app)
      .post(`/api/admin/empresas/${company.id}/informes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ desde: '2026-07-07', hasta: '2026-07-01' });
    expect(invalido.status).toBe(400);

    expect(generarMock).not.toHaveBeenCalled();
  });

  it('devuelve 502 si la API de Claude falla, sin guardar nada', async () => {
    const { company } = await setupCompanyWithActivity();
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');
    generarMock.mockRejectedValueOnce(new Error('overloaded'));

    const res = await request(app)
      .post(`/api/admin/empresas/${company.id}/informes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ desde: '2026-07-01', hasta: '2026-07-07' });

    expect(res.status).toBe(502);
    expect(await prisma.report.count()).toBe(0);
  });
});

describe('ciclo de estados del informe', () => {
  async function createInforme(companyId: string, token: string): Promise<string> {
    const res = await request(app)
      .post(`/api/admin/empresas/${companyId}/informes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ desde: '2026-07-01', hasta: '2026-07-07' });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('permite editar el contenido y avanzar BORRADOR → REVISADO → ENVIADO, pero no saltar ni retroceder', async () => {
    const { company } = await setupCompanyWithActivity();
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');
    const informeId = await createInforme(company.id, token);
    const base = `/api/admin/empresas/${company.id}/informes/${informeId}`;

    // BORRADOR → ENVIADO directamente: prohibido (siempre pasa por revisión).
    const salto = await request(app).put(base).set('Authorization', `Bearer ${token}`).send({ status: 'ENVIADO' });
    expect(salto.status).toBe(400);

    const editado = await request(app)
      .put(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '## Informe revisado\n\nTexto editado por Digital Power.', status: 'REVISADO' });
    expect(editado.status).toBe(200);
    expect(editado.body.status).toBe('REVISADO');
    expect(editado.body.content).toContain('editado por Digital Power');

    // El borrador original de Claude se conserva aunque se edite el contenido.
    const stored = await prisma.report.findUniqueOrThrow({ where: { id: informeId } });
    expect(stored.draftContent).toContain('Borrador de prueba');

    const enviado = await request(app).put(base).set('Authorization', `Bearer ${token}`).send({ status: 'ENVIADO' });
    expect(enviado.status).toBe(200);
    expect(enviado.body.status).toBe('ENVIADO');

    // Enviado: ni se edita, ni cambia de estado, ni se elimina.
    const editarEnviado = await request(app).put(base).set('Authorization', `Bearer ${token}`).send({ content: 'hack' });
    expect(editarEnviado.status).toBe(400);
    const retroceso = await request(app).put(base).set('Authorization', `Bearer ${token}`).send({ status: 'BORRADOR' });
    expect(retroceso.status).toBe(400);
    const borrar = await request(app).delete(base).set('Authorization', `Bearer ${token}`);
    expect(borrar.status).toBe(400);
  });

  it('los borradores sí se pueden eliminar', async () => {
    const { company } = await setupCompanyWithActivity();
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });
    const token = await loginAdmin('super@test.dev');
    const informeId = await createInforme(company.id, token);

    const res = await request(app)
      .delete(`/api/admin/empresas/${company.id}/informes/${informeId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.report.count()).toBe(0);
  });
});

describe('aislamiento multi-tenant de informes', () => {
  it('un CLIENTE no puede listar, generar ni tocar informes de otra empresa', async () => {
    const { company: companyA } = await setupCompanyWithActivity();
    const companyB = await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'cliente-b@test.dev', password: 'secreto123', role: AdminRole.CLIENTE, companyId: companyB.id });
    await createAdminUser({ email: 'super@test.dev', password: 'secreto123', role: AdminRole.SUPERADMIN });

    const tokenSuper = await loginAdmin('super@test.dev');
    const creado = await request(app)
      .post(`/api/admin/empresas/${companyA.id}/informes`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ desde: '2026-07-01', hasta: '2026-07-07' });
    expect(creado.status).toBe(201);

    const tokenB = await loginAdmin('cliente-b@test.dev');
    const list = await request(app)
      .get(`/api/admin/empresas/${companyA.id}/informes`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(list.status).toBe(403);

    const post = await request(app)
      .post(`/api/admin/empresas/${companyA.id}/informes`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ desde: '2026-07-01', hasta: '2026-07-07' });
    expect(post.status).toBe(403);

    const put = await request(app)
      .put(`/api/admin/empresas/${companyA.id}/informes/${creado.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'REVISADO' });
    expect(put.status).toBe(403);

    // Y el id de un informe ajeno tampoco resuelve bajo la empresa propia (404, no fuga).
    const cross = await request(app)
      .get(`/api/admin/empresas/${companyB.id}/informes/${creado.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(cross.status).toBe(404);
  });
});
