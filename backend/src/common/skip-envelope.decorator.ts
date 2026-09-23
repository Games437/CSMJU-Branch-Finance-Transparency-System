import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/**
 * Explicit opt-out of ResponseEnvelopeInterceptor. Same pattern as
 * rbac/public.decorator.ts's @Public() — an explicit decorator instead
 * of an implicit exception list, so a future route's envelope behavior
 * is a visible decision, not something that silently depends on the
 * interceptor's internal logic guessing correctly.
 *
 * Used on: HealthController (api-conventions.md Section 8 shows a bare
 * {status, version} shape for /health specifically, not the envelope).
 *
 * NOT needed on EvidenceController.download(): that handler uses
 * @Res() res: Response without { passthrough: true }, which means Nest
 * does not apply any of its own response handling (interceptors
 * included) to what the handler returns — the raw file bytes are
 * already sent via res.send() before the interceptor's transform would
 * even matter. Handlers using bare @Res() are unaffected by this
 * interceptor either way, so they don't need this decorator.
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
