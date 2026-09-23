import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SkipEnvelope } from '../common/skip-envelope.decorator';

// Read once at module load, not per-request — package.json won't change
// while the process is running, so re-reading it on every health check
// call would be pointless I/O on what's meant to be a cheap,
// high-frequency monitoring endpoint.
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as {
  version: string;
};

/**
 * GET /health — base item #1 / api-conventions.md Section 8.
 *
 * Deliberately NOT under /api/v1 (health checks are infrastructure
 * plumbing, not a versioned business resource — api-conventions.md's
 * own public_endpoints example lists "GET /health" with no prefix) and
 * NOT behind AuthGuard/RbacGuard ("ไม่ต้องแนบ token"). No @UseGuards()
 * at all here — simplest way to guarantee this route bypasses auth
 * entirely, rather than relying on a bypass flag that could be
 * misconfigured later.
 *
 * Response is NOT wrapped in the {success, data, meta} envelope
 * (base item #3/#6) — api-conventions.md Section 8 shows this exact
 * bare {status, version} shape as the standard for this one endpoint.
 */
@Controller('health')
export class HealthController {
  @Get()
  @SkipEnvelope()
  check() {
    return { status: 'ok', version: packageJson.version };
  }
}
