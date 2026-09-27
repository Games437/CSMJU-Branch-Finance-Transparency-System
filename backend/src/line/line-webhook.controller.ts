import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { SkipEnvelope } from "../common/skip-envelope.decorator";
import { LineSignatureGuard } from "./guards/line-signature.guard";
import { LineService } from "./line.service";
import { LineWebhookBody } from "./interfaces/line-webhook.interface";

/**
 * The one endpoint LINE's platform itself calls. Deliberately NOT under
 * AuthGuard/RbacGuard (see LineSignatureGuard's own comment for why) and
 * deliberately always returns 200 once the request is authenticated and
 * accepted — per-event failures are logged, not surfaced as an HTTP error
 * (LineService#handleWebhookEvents never throws for an individual event;
 * this handler only has to worry about the signature check itself
 * failing, which LineSignatureGuard turns into a 401 before this method
 * ever runs).
 */
@Controller("line")
@UseGuards(LineSignatureGuard)
export class LineWebhookController {
  constructor(private readonly lineService: LineService) {}

  @Post("webhook")
  @HttpCode(200)
  @SkipEnvelope() // LINE's platform is the caller here, not our frontend — it
  // does not expect/parse our {success,data} envelope, and only checks the
  // HTTP status code (same reasoning as health.controller.ts).
  async webhook(@Body() body: LineWebhookBody): Promise<{ ok: true }> {
    await this.lineService.handleWebhookEvents(body?.events ?? []);
    return { ok: true };
  }
}
