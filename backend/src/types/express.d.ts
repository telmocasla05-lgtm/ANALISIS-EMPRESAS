import type { AdminRole } from '@digital-power/shared';

declare global {
  namespace Express {
    interface Request {
      employeeSession?: { employeeId: string; companyId: string };
      admin?: { adminId: string; role: AdminRole; companyId: string | null };
    }
  }
}

export {};
