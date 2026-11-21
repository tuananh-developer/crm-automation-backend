import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { N8nAuthGuard } from '../../lead-intelligence/guards/n8n-auth.guard.js';

@Injectable()
export class RenewalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly n8nGuard: N8nAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Try N8nAuthGuard first (API key / secret)
    try {
      const n8nResult = this.n8nGuard.canActivate(context);
      if (n8nResult) return true;
    } catch {
      // Fall through to JwtAuthGuard
    }

    // Try JwtAuthGuard (Bearer JWT token for CRM users)
    try {
      const jwtResult = await Promise.resolve(
        this.jwtGuard.canActivate(context),
      );
      if (jwtResult) return true;
    } catch {
      // Fall through
    }

    return false;
  }
}
