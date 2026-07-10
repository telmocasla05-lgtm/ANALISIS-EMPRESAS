import cors from 'cors';
import express, { type Express } from 'express';
import { prisma } from './lib/prisma.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLog } from './middleware/request-log.js';
import { adminAuthRouter } from './routes/admin/auth.js';
import { adminCategoriasRouter } from './routes/admin/categorias.js';
import { adminEmpleadosRouter } from './routes/admin/empleados.js';
import { adminEmpresasRouter } from './routes/admin/empresas.js';
import { adminInformesRouter } from './routes/admin/informes.js';
import { adminReglasRouter } from './routes/admin/reglas.js';
import { adminRolesRouter } from './routes/admin/roles.js';
import { authRouter } from './routes/auth.js';
import { categoriasRouter } from './routes/categorias.js';
import { empresasRouter } from './routes/empresas.js';
import { sesionesRouter } from './routes/sesiones.js';

// CORS: con CORS_ORIGINS definido (lista separada por comas) solo se aceptan
// esos orígenes — en producción, los dominios de Vercel del panel y la tablet.
// Sin definir se permite cualquier origen (desarrollo local). Las peticiones
// sin cabecera Origin (app Electron, curl, healthcheck) no pasan por CORS.
function corsOptions(): cors.CorsOptions {
  const raw = process.env['CORS_ORIGINS']?.trim();
  if (!raw) return {};
  const allowed = new Set(
    raw
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );
  return {
    origin: (origin, callback) => callback(null, origin === undefined || allowed.has(origin)),
  };
}

export function createApp(): Express {
  const app = express();
  // Detrás del proxy de Railway: X-Forwarded-* fiable (IP real del cliente).
  app.set('trust proxy', 1);
  app.use(cors(corsOptions()));
  // Los lotes de registros del desktop/tablet (hasta 500) pueden superar el
  // límite por defecto de 100 kB.
  app.use(express.json({ limit: '1mb' }));
  if (process.env['NODE_ENV'] !== 'test') app.use(requestLog);

  // Healthcheck (Railway lo comprueba en cada deploy): incluye ping a la BD.
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'Base de datos no disponible' });
    }
  });

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
  app.use('/api/admin/empresas/:companyId/informes', adminInformesRouter);
  app.use('/api/admin/empresas', adminEmpresasRouter);

  app.use(errorHandler);
  return app;
}
