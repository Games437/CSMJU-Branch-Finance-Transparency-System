// Minimal shape of a LINE Messaging API webhook payload — only the fields
// this feature actually reads. See LINE Developers docs ("Webhook event
// object") for the full shape; everything else is ignored on purpose.

export interface LineWebhookSource {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineWebhookMessage {
  id: string;
  type: string; // "text", "image", "file", "sticker", ...
  text?: string; // present only when type === "text"
  // Present only when type === "file" (confirmed against LINE's own
  // webhook.yml OpenAPI spec — FileMessageContent requires both). LINE
  // does NOT restrict this to any extension allowlist on its side; ours
  // is enforced downstream by EvidenceService's ALLOWED_MIME_TYPES.
  fileName?: string;
  fileSize?: number;
}

export interface LineWebhookEvent {
  type: string; // "message", "follow", "unfollow", "postback", ...
  replyToken?: string;
  source: LineWebhookSource;
  message?: LineWebhookMessage;
  timestamp: number;
}

export interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}
