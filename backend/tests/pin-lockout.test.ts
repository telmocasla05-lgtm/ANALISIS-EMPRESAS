import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { createCompany, createEmployee, createRole } from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await resetDatabase();
});

describe('bloqueo temporal por PIN (§5)', () => {
  it('bloquea tras 5 intentos fallidos seguidos y admite el PIN correcto de nuevo pasado el bloqueo', async () => {
    const company = await createCompany({ name: 'Clínica Lockout' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleado', pin: '1234' });

    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '0000' });
      expect(res.status).toBe(401);
    }

    // 5º intento fallido seguido → bloqueo temporal
    const fifth = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '0000' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.lockedUntil).toBeTruthy();

    // Mientras dura el bloqueo, ni siquiera el PIN correcto entra
    const correctWhileLocked = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '1234' });
    expect(correctWhileLocked.status).toBe(429);

    const locked = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.failedPinAttempts).toBe(0); // se resetea el contador al activar el bloqueo

    // Simula que ya pasó el tiempo de bloqueo
    await prisma.employee.update({ where: { id: employee.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });

    const afterLockout = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '1234' });
    expect(afterLockout.status).toBe(200);

    const recovered = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(recovered.failedPinAttempts).toBe(0);
    expect(recovered.lockedUntil).toBeNull();
  });

  it('un PIN correcto antes de llegar a 5 fallos resetea el contador', async () => {
    const company = await createCompany({ name: 'Clínica Lockout 2' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Empleado', pin: '1234' });

    await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '0000' });
    await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '0000' });

    const ok = await request(app).post('/api/auth/pin').send({ employeeId: employee.id, pin: '1234' });
    expect(ok.status).toBe(200);

    const employeeAfter = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(employeeAfter.failedPinAttempts).toBe(0);
  });
});
