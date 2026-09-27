import * as crypto from "crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/**
 * Verifies the `x-line-signature` header LINE attaches to every webhook
 * request: HMAC-SHA256 of the raw request body, using the channel secret,
 * base64-encoded (per LINE Messaging API docs — "Verifying signatures").
 *
 * This guard is what stands in for AuthGuard/RbacGuard on the webhook
 * route: the caller here is LINE's platform, not a logged-in staff member,
 * so there is no x-external-user-id header to check. Deliberately fails
 * CLOSED if LINE_CHANNEL_SECRET isn't configured — an unconfigured secret
 * must never be treated as "accept anything".
 *
 * Requires `req.rawBody` (a Buffer of the exact bytes LINE sent) rather
 * than `req.body` (the parsed JSON) — recomputing JSON.stringify(req.body)
 * would not byte-for-byte match what LINE actually signed (key order,
 * whitespace, unicode escaping can all differ), so main.ts enables
 * `rawBody: true` in NestFactory.create for this reason.
 */
@Injectable()
export class LineSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const channelSecret = this.config.get<string>("LINE_CHANNEL_SECRET");

    if (!channelSecret) {
      throw new UnauthorizedException("LINE_CHANNEL_SECRET is not configured on this server.");
    }

    const signature = request.header("x-line-signature");
    const rawBody = request.rawBody;

    if (!signature || !rawBody) {
      throw new UnauthorizedException("Missing LINE signature or request body.");
    }

    const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(signature);

    // Length check before timingSafeEqual: it throws (rather than
    // returning false) if the two buffers differ in length.
    const valid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!valid) {
      throw new UnauthorizedException("Invalid LINE webhook signature.");
    }

    return true;
  }
}
