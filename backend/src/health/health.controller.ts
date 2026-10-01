import { Controller, Get } from '@nestjs/common';
import { SUBSYSTEM_SLUG } from '../common/constants/subsystem';

// AMENDED 2026-09-27 (team decision: "ยึด repo กลาง" — the real
// csmju2030-standards repo replaces an older draft doc this project used
// to follow). Two things changed from the previous version of this file:
//
// 1. Path: the real api-conventions.md §1/§8 puts health at GET
//    /api/health specifically (not bare /health — that was the old
//    draft's convention). It's still outside /api/v1 (infrastructure
//    plumbing, not a versioned business resource — the real doc lists
//    it as one of exactly two paths outside /api/v1/, the other being
//    /auth/callback), so main.ts excludes 'api/health' from the global
//    v1 prefix, and this controller's own path is the full 'api/health'.
// 2. Response shape: the real api-conventions.md §8 wraps this in the
//    normal { success, data: { status, service } } envelope — unlike
//    the old draft, which wanted a bare unwrapped { status, version }.
//    @SkipEnvelope() is removed so this goes through the same
//    ResponseEnvelopeInterceptor as every other endpoint.
@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: SUBSYSTEM_SLUG };
  }
}
