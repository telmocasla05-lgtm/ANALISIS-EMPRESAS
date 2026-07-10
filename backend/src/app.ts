import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { adminAuthRouter } from './routes/admin/auth.js';
import { adminCategoriasRouter } from './routes/admin/categorias.js';
import { adminEmpleadosRouter } from './routes/admin/empleados.js';
import { adminEmpresasRouter } from './routes/admin/empresas.js';
import { adminReglasRouter } from './routes/admin/reglas.js';
import { adminRolesRouter } from './routes/admin/roles.js';
import { authRouter } from './routes/auth.js';
import { categoriasRouter } from './routes/categorias.js';
import { empresasRouter } from './routes/empresas.js';
import { sesionesRouter } from './routes/sesiones.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Auth y tracking (apps de escritorio/tablet)
  app.use('/api/empresas', empresasRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/sesiones', sesionesRouter);
  app.use('/api/categorias', categoriasRouter);

  // Admin (panel de Digital Power / dueño del cliente)
  app.use('/api/admin/auth', adminAuthRouter);
  app.use('/api/admin/empresas/:companyId/empleados', adminEmpleadosRouter);
  app.use('/api/admin/empresas/:companyId/roles', adminRolesRouter);
  app.use('/api/admin/empresas/:companyId/reglas', adminReglasRouter);
  app.use('/api/admin/empresas/:companyId/categorias', adminCategoriasRouter);
  app.use('/api/admin/empresas', adminEmpresasRouter);

  app.use(errorHandler);
  return app;
}
