import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Thin wrapper around the two LINE Messaging API calls this feature
 * needs. Uses the Node 18+ global `fetch` (no new dependency — this
 * backend has no axios/node-fetch installed, and adding one just for two
 * calls isn't worth it).
 *
 * Deliberately "best effort": a failure to send a reply must never fail
 * the webhook request itself (LineController always returns 200 once the
 * inbound message is durably recorded) — see the try/catch at every call
 * site in LineService. LINE disables a webhook after repeated
 * non-200/timeout responses, so the one thing this integration cannot do
 * is let a downstream call (like this one) turn an otherwise-successful
 * webhook delivery into an error response.
 */
@Injectable()
export class LineClientService {
  private readonly logger = new Logger(LineClientService.name);

  constructor(private readonly config: ConfigService) {}

  private get accessToken(): string | undefined {
    return this.config.get<string>("LINE_CHANNEL_ACCESS_TOKEN");
  }

  /**
   * Replies to a specific webhook event. `replyToken` is single-use and
   * expires quickly (LINE docs: "may become invalid after a certain
   * period"), so this must be called synchronously while handling that
   * event — never queued/delayed.
   */
  async reply(replyToken: string, text: string): Promise<void> {
    const token = this.accessToken;
    if (!token) {
      this.logger.warn("LINE_CHANNEL_ACCESS_TOKEN is not configured — skipping reply.");
      return;
    }

    try {
      const response = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [{ type: "text", text }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`LINE reply API returned ${response.status}: ${body}`);
      }
    } catch (error) {
      this.logger.error(`LINE reply API call threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Downloads the binary content of an image/video/audio/file message
   * (LINE Developers — "Get content"). Confirmed against LINE's own
   * published OpenAPI spec (line/line-openapi on GitHub): this operation
   * uses a DIFFERENT host (api-data.line.me) than every other Messaging
   * API call in this file (api.line.me) — easy to get wrong by assuming
   * every endpoint shares one host, so this is called out explicitly.
   * The endpoint itself is not typed by message kind — it is keyed only
   * by messageId — so the same call serves image AND file (e.g. PDF)
   * messages; the OpenAPI operation description only mentions "image,
   * video, and audio" (not updated when the file message type was added
   * — confirmed by cross-checking the official Python SDK's FileMessage
   * docstring, "The binary file data can be retrieved with the Content
   * API"), but the endpoint itself has no such restriction.
   *
   * `fallbackMimeType` is used only when LINE's response omits a
   * Content-Type header — this should be rare, but when it happens for a
   * "file" message we must NOT silently default to an image type (that
   * would previously mislabel a PDF as image/jpeg); the caller passes a
   * fallback appropriate to what it actually asked for (the message's
   * own type, or a guess from its reported file name).
   *
   * Returns null (rather than throwing) on any failure — the caller
   * decides how to tell the user "downloading your photo/file failed",
   * and this must never turn a successfully-received webhook into an
   * error response (same reasoning as reply() above).
   */
  async getMessageContent(
    messageId: string,
    fallbackMimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const token = this.accessToken;
    if (!token) {
      this.logger.warn("LINE_CHANNEL_ACCESS_TOKEN is not configured — cannot download message content.");
      return null;
    }

    try {
      const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        this.logger.error(`LINE get-content API returned ${response.status} for message ${messageId}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const mimeType = response.headers.get("content-type") ?? fallbackMimeType;
      return { buffer: Buffer.from(arrayBuffer), mimeType };
    } catch (error) {
      this.logger.error(
        `LINE get-content API call threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
