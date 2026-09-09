import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_STRATEGY, AuthStrategy, AuthenticatedUser } from './interfaces/authenticated-user.interface';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_STRATEGY) private readonly strategy: AuthStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.strategy.resolve(request);
    return true;
  }
}
