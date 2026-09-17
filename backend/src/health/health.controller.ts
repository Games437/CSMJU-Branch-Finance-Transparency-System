import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read once at module load, not per-request — this file barely changes
// at runtime and a health check should be as cheap as possible (it may
// be polled every few seconds by monitoring/gateway).
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as {
  version: string;
};

/**
 * GET /health — base item #1 / api-conventions.md Section 8.
 *
 * Deliberately NOT under /api/v1 (health checks are infrastructure
 * plumbing, not a versioned business resource) and NOT behind
 * AuthGuard/RbacGuard (api-conventions.md Section 8: "ไม่ต้องแนบ
 * token"). No @UseGuards() at all here — simplest way to guarantee
 * this route bypasses auth entirely, rather than relying on a
 * bypass flag that could be misconfigured.
 *
 * Response is NOT wrapped in the {success, data} envelope (base item
 * #3) — api-conventions.md Section 8 shows this exact bare shape as
 * the standard, and health/monitoring endpoints are conventionally
 * exempt from an API's normal response envelope everywhere this kind
 * of convention exists.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', version: packageJson.version };
  }
}
