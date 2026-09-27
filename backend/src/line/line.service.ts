import * as crypto from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { LineAccountLink, Role, User as PrismaUser } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { YearScopeService } from "../rbac/year-scope.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { EvidenceService } from "../evidence/evidence.service";
import { LineClientService } from "./line-client.service";
import { extractLinkCode, parseLineMessage } from "./line-parser";
import { LineWebhookEvent } from "./interfaces/line-webhook.interface";

const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Excludes 0/O/1/I (ambiguous on a phone screen) — this code is meant to
// be read off the web app and typed into LINE by a person.
const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// How long after reporting a transaction a Treasurer can still send a
// photo and have it auto-bound as that transaction's evidence (confirmed
// with the user, 2026-09-27 — chosen over asking them to pick from a
// list, since "type the amount, then send the photo" is the natural
// message order in a chat).
const EVIDENCE_BINDING_WINDOW_MINUTES = 15;
const EVIDENCE_BINDING_WINDOW_MS = EVIDENCE_BINDING_WINDOW_MINUTES * 60 * 1000;

// Placeholder for LineMessageEvent.rawText (NOT NULL) when the inbound
// message has no text at all — an image/file message has nothing else
// to log there.
const IMAGE_MESSAGE_LOG_TEXT = "[รูปภาพที่ส่งเข้ามา]";

// Extension guess used ONLY as a last resort when LINE's "Get content"
// response omits a Content-Type header for a "file" message — confirmed
// with the user, 2026-09-27, that PDF is the format branches will
// actually use (matches EvidenceService.ALLOWED_MIME_TYPES). An
// unrecognized extension falls back to "application/octet-stream" so it
// is rejected by EvidenceService's allowlist rather than silently
// mislabeled as something it isn't.
const FILE_EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function guessMimeTypeFromFileName(fileName: string | undefined): string {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return (ext && FILE_EXTENSION_MIME_MAP[ext]) || "application/octet-stream";
}

const thb = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yearScope: YearScopeService,
    private readonly audit: AuditService,
    private readonly lineClient: LineClientService,
    private readonly evidenceService: EvidenceService,
  ) {}

  // --------------------------------------------------------------------
  // Account linking — called from LineAccountController, i.e. through the
  // normal AuthGuard/RbacGuard (the caller is already an authenticated
  // Treasurer in our own system; this is what makes the link trustworthy
  // — see schema.prisma's LineLinkCode comment).
  // --------------------------------------------------------------------

  async generateLinkCode(user: AuthenticatedUser): Promise<{ code: string; expiresAt: string }> {
    const code = this.randomCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    await this.prisma.lineLinkCode.create({
      data: {
        code,
        userId: user.id,
        username: user.externalUserId,
        expiresAt,
      },
    });

    return { code, expiresAt: expiresAt.toISOString() };
  }

  async getLinkStatus(user: AuthenticatedUser): Promise<{ linked: boolean; linkedAt: string | null }> {
    const link = await this.prisma.lineAccountLink.findUnique({ where: { userId: user.id } });
    return { linked: Boolean(link), linkedAt: link?.linkedAt.toISOString() ?? null };
  }

  async unlink(user: AuthenticatedUser): Promise<void> {
    const existing = await this.prisma.lineAccountLink.findUnique({ where: { userId: user.id } });
    if (!existing) {
      return; // idempotent — nothing to unlink is not an error
    }

    await this.prisma.lineAccountLink.delete({ where: { userId: user.id } });
    await this.audit.record({
      actorId: user.id,
      actorUsername: user.externalUserId,
      action: "LINE_ACCOUNT_UNLINKED",
      targetType: "User",
      targetId: user.id,
      beforeJson: { lineUserId: existing.lineUserId },
    });
  }

  private randomCode(length = 8): string {
    let code = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      code += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
    }
    return code;
  }

  // --------------------------------------------------------------------
  // Webhook processing — called from LineWebhookController, guarded ONLY
  // by LineSignatureGuard (no AuthGuard/RbacGuard: the caller is LINE's
  // platform, not a logged-in user of our system).
  //
  // Per-event try/catch: LINE expects a 200 response for the WHOLE
  // request as soon as it's durably received, regardless of how many of
  // the (usually one) events in it succeed or fail to process — a
  // repeatedly-failing webhook gets disabled by LINE. LineWebhookController
  // relies on this method never throwing.
  // --------------------------------------------------------------------

  async handleWebhookEvents(events: LineWebhookEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.handleEvent(event);
      } catch (error) {
        this.logger.error(
          `Unhandled error processing LINE webhook event: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
        );
      }
    }
  }

  private async handleEvent(event: LineWebhookEvent): Promise<void> {
    if (event.type === "follow" && event.replyToken) {
      await this.lineClient.reply(
        event.replyToken,
        "สวัสดีค่ะ 👋 บัญชีนี้ใช้สำหรับแจ้งรายรับ-รายจ่ายของสาขา\n\n" +
          "ก่อนใช้งาน กรุณาไปที่หน้า \"เชื่อมต่อ LINE\" ในระบบ (ต้องเข้าสู่ระบบด้วยบทบาทเหรัญญิก) เพื่อขอรหัสเชื่อมต่อ แล้วพิมพ์ส่งมาที่นี่ในรูปแบบ:\nผูกบัญชี <รหัส>",
      );
      return;
    }

    if (event.type !== "message") {
      return; // follow already handled above; unfollow/postback/etc: out of scope
    }

    const lineUserId = event.source.userId;
    if (!lineUserId) {
      // Shouldn't normally happen for a "message" event, but source.userId
      // is documented as optional in some source types — nothing to
      // attribute this to, so there is nothing safe to do with it.
      this.logger.warn("Received a LINE message event with no source.userId — ignoring.");
      return;
    }

    const messageType = event.message?.type;
    if (messageType === "image" || messageType === "file") {
      // Both are handled identically from here — bind to the sender's
      // most recent PENDING EXPENSE within the binding window and reuse
      // EvidenceService.upload() verbatim. Confirmed against LINE's own
      // webhook.yml OpenAPI spec that "file" (fileName/fileSize, e.g. a
      // PDF receipt) is a distinct message type from "image", with
      // content retrievable through the same Content API — see
      // line-client.service.ts's getMessageContent() comment. Requested
      // by the user, 2026-09-27, since our own evidence upload already
      // allows application/pdf.
      await this.handleEvidenceMessage(event, lineUserId, messageType);
      return;
    }

    if (event.message?.type !== "text" || !event.message.text) {
      return; // stickers/video/other message types: out of scope, silently ignored
    }
    const rawText = event.message.text;

    const linkCode = extractLinkCode(rawText);
    if (linkCode !== null) {
      await this.handleLinkCommand(event, lineUserId, linkCode, rawText);
      return;
    }

    await this.handleTransactionReport(event, lineUserId, rawText);
  }

  /**
   * Looks up the LINE account link and resolves it to an active
   * TREASURER, writing the appropriate LineMessageEvent + reply and
   * returning null on any failure — shared by handleTransactionReport
   * and handleImageMessage so the "who is allowed to do this" checks
   * can't drift between the two.
   */
  private async resolveTreasurerLink(
    event: LineWebhookEvent,
    lineUserId: string,
    rawTextForLog: string,
  ): Promise<{ link: LineAccountLink; dbUser: PrismaUser } | null> {
    const link = await this.prisma.lineAccountLink.findUnique({ where: { lineUserId } });

    if (!link) {
      await this.prisma.lineMessageEvent.create({
        data: { lineUserId, rawText: rawTextForLog, status: "UNLINKED_SENDER" },
      });
      if (event.replyToken) {
        await this.lineClient.reply(
          event.replyToken,
          "ยังไม่ได้เชื่อมต่อบัญชีนี้ กรุณาไปที่หน้า \"เชื่อมต่อ LINE\" ในระบบเพื่อขอรหัส แล้วพิมพ์ส่งมาในรูปแบบ:\nผูกบัญชี <รหัส>",
        );
      }
      return null;
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: link.userId } });

    // ASSUMPTION (confirmed with the user, 2026-09-26): only TREASURER is
    // in scope for this quick-entry channel for the MVP — a Branch Head
    // is not tied to a single year account, so there's no unambiguous
    // year to attribute their message to. Extend this if/when that's
    // asked for explicitly, rather than guessing an attribution rule now.
    if (!dbUser || !dbUser.active || dbUser.role !== Role.TREASURER) {
      await this.prisma.lineMessageEvent.create({
        data: { lineUserId, username: link.username, rawText: rawTextForLog, status: "NOT_TREASURER" },
      });
      if (event.replyToken) {
        await this.lineClient.reply(event.replyToken, "บทบาทของบัญชีนี้ยังไม่รองรับการแจ้งยอดผ่าน LINE");
      }
      return null;
    }

    return { link, dbUser };
  }

  private async handleLinkCommand(
    event: LineWebhookEvent,
    lineUserId: string,
    code: string,
    rawText: string,
  ): Promise<void> {
    const linkCode = await this.prisma.lineLinkCode.findUnique({ where: { code } });
    const isValid = Boolean(linkCode) && !linkCode!.usedAt && linkCode!.expiresAt.getTime() > Date.now();

    if (!linkCode || !isValid) {
      await this.prisma.lineMessageEvent.create({
        data: {
          lineUserId,
          rawText,
          status: "LINK_CODE_INVALID",
          errorReason: !linkCode ? "code_not_found" : linkCode.usedAt ? "code_already_used" : "code_expired",
        },
      });
      if (event.replyToken) {
        await this.lineClient.reply(
          event.replyToken,
          "❌ รหัสเชื่อมต่อไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้า \"เชื่อมต่อ LINE\" ในระบบ",
        );
      }
      return;
    }

    // Re-linking safety: remove any stale link this LINE account or this
    // username already held (phone change / account handover), so the
    // unique constraints on both lineUserId and userId never conflict.
    await this.prisma.lineAccountLink.deleteMany({
      where: { OR: [{ lineUserId }, { userId: linkCode.userId }] },
    });
    await this.prisma.$transaction([
      this.prisma.lineAccountLink.create({
        data: { lineUserId, userId: linkCode.userId, username: linkCode.username },
      }),
      this.prisma.lineLinkCode.update({ where: { id: linkCode.id }, data: { usedAt: new Date() } }),
      this.prisma.lineMessageEvent.create({
        data: { lineUserId, username: linkCode.username, rawText, status: "LINK_CODE_CONSUMED" },
      }),
    ]);

    await this.audit.record({
      actorId: linkCode.userId,
      actorUsername: linkCode.username,
      action: "LINE_ACCOUNT_LINKED",
      targetType: "User",
      targetId: linkCode.userId,
      afterJson: { lineUserId },
    });

    if (event.replyToken) {
      await this.lineClient.reply(
        event.replyToken,
        `✅ ผูกบัญชีกับผู้ใช้ "${linkCode.username}" สำเร็จแล้ว\nต่อจากนี้พิมพ์แจ้งยอดเข้ามาได้เลย เช่น "เก็บเงินห้องได้ 500 บาท"`,
      );
    }
  }

  private async handleTransactionReport(event: LineWebhookEvent, lineUserId: string, rawText: string): Promise<void> {
    const resolved = await this.resolveTreasurerLink(event, lineUserId, rawText);
    if (!resolved) return;
    const { link, dbUser } = resolved;

    const activeYearIds = await this.yearScope.getActiveYearAccountIds(dbUser.id);
    if (activeYearIds.length === 0) {
      await this.prisma.lineMessageEvent.create({
        data: { lineUserId, username: link.username, rawText, status: "NO_ACTIVE_YEAR" },
      });
      if (event.replyToken) {
        await this.lineClient.reply(
          event.replyToken,
          "ไม่พบชั้นปีที่ท่านดูแลอยู่ในขณะนี้ กรุณาติดต่อหัวหน้าสาขา",
        );
      }
      return;
    }
    // If a Treasurer somehow has more than one active assignment at once,
    // take the first — this shouldn't normally happen (Business Rule:
    // one active TREASURER per year, and seed.ts's own handover scenario
    // closes the old assignment before opening a new one), but silently
    // guessing "which year" for a genuinely ambiguous case is exactly the
    // kind of assumption this project's docs ask not to make quietly, so
    // this is flagged here rather than hidden.
    const yearAccountId = activeYearIds[0];

    const parsed = parseLineMessage(rawText);
    if (parsed.amount === null) {
      await this.prisma.lineMessageEvent.create({
        data: {
          lineUserId,
          username: link.username,
          rawText,
          status: "PARSE_FAILED",
          errorReason: "no_amount_found",
        },
      });
      if (event.replyToken) {
        await this.lineClient.reply(
          event.replyToken,
          '❌ อ่านยอดเงินจากข้อความไม่ได้ กรุณาระบุตัวเลขให้ชัดเจน เช่น "เก็บเงินห้องได้ 500 บาท"',
        );
      }
      return;
    }

    const description =
      parsed.category ?? (parsed.type === "INCOME" ? "รายรับที่แจ้งผ่าน LINE" : "รายจ่ายที่แจ้งผ่าน LINE");
    // Business Rule / Integration Spec principle (already applied to
    // BANK_IMPORT income): anything not entered through the normal
    // web-form + evidence-upload flow must land in a state a human still
    // has to confirm before it counts. INCOME -> NEEDS_REVIEW (same as
    // BANK_IMPORT). EXPENSE must never be NEEDS_REVIEW (see schema.prisma
    // comment on TransactionStatus) — it follows the same PENDING path a
    // manually-created expense would.
    const status = parsed.type === "INCOME" ? "NEEDS_REVIEW" : "PENDING";

    const transaction = await this.prisma.transaction.create({
      data: {
        yearAccountId,
        type: parsed.type,
        status,
        amount: parsed.amount,
        // No date is given in a free-text message — defaults to "today".
        // ASSUMPTION, flagged rather than silently guessed: if this turns
        // out wrong for backdated reports, the Treasurer can still edit
        // the transaction's date afterward via the normal web form.
        transactionDate: new Date(),
        description,
        category: parsed.category,
        sourceType: "LINE_REPORT",
        createdBy: dbUser.id,
        createdByUsername: dbUser.externalUserId,
      },
    });

    await this.prisma.lineMessageEvent.create({
      data: {
        lineUserId,
        username: link.username,
        rawText,
        parsedCategory: parsed.category,
        parsedAmount: parsed.amount,
        parsedType: parsed.type,
        status: "CREATED",
        transactionId: transaction.id,
      },
    });

    await this.audit.record({
      actorId: dbUser.id,
      actorUsername: dbUser.externalUserId,
      action: parsed.type === "INCOME" ? "LINE_INCOME_REPORTED" : "LINE_EXPENSE_REPORTED",
      targetType: "Transaction",
      targetId: transaction.id,
      yearAccountId,
      afterJson: { status: transaction.status, amount: transaction.amount.toString(), category: transaction.category },
    });

    if (event.replyToken) {
      const sign = parsed.type === "EXPENSE" ? "-" : "+";
      const statusLabel = status === "NEEDS_REVIEW" ? "รอหัวหน้าสาขายืนยัน" : "รอหัวหน้าสาขาอนุมัติ";
      await this.lineClient.reply(
        event.replyToken,
        `✅ บันทึกแล้ว: ${description} ${sign}${thb.format(parsed.amount)} บาท (${statusLabel})`,
      );
    }
  }

  /**
   * A photo OR file (e.g. PDF receipt) sent to the LINE OA. Bound to the
   * sender's most recent LINE-created transaction (INCOME or EXPENSE) if
   * it's still in the not-yet-decided status for its type and within
   * EVIDENCE_BINDING_WINDOW_MS — see the enum comment on LineMessageStatus
   * in schema.prisma for why this binding rule (rather than asking the
   * user to pick from a list) was chosen, and for why it's no longer
   * EXPENSE-only. Image and file messages share this one handler since,
   * past "how do we log what came in and guess its MIME type", the
   * binding/download/upload logic is identical — see handleEvent()'s
   * branch for why.
   */
  private async handleEvidenceMessage(
    event: LineWebhookEvent,
    lineUserId: string,
    mediaKind: "image" | "file",
  ): Promise<void> {
    const mediaLabel = mediaKind === "image" ? "รูป" : "ไฟล์";
    const rawTextForLog =
      mediaKind === "image" ? IMAGE_MESSAGE_LOG_TEXT : `[ไฟล์ที่ส่งเข้ามา: ${event.message?.fileName ?? "ไม่ทราบชื่อไฟล์"}]`;

    const resolved = await this.resolveTreasurerLink(event, lineUserId, rawTextForLog);
    if (!resolved) return;
    const { link } = resolved;

    const windowStart = new Date(Date.now() - EVIDENCE_BINDING_WINDOW_MS);
    const recentEvent = await this.prisma.lineMessageEvent.findFirst({
      where: { lineUserId, status: "CREATED", receivedAt: { gte: windowStart } },
      orderBy: { receivedAt: "desc" },
    });

    const transaction = recentEvent?.transactionId
      ? await this.prisma.transaction.findUnique({ where: { id: recentEvent.transactionId } })
      : null;

    // Business Rule 6 (01_BUSINESS_RULES_SPECIFICATION.md), AMENDED
    // 2026-09-27 — confirmed with the user after a real report showed
    // this rejecting a photo meant for an income entry: evidence is no
    // longer Expense-only. "Eligible" now means "still in the not-yet-
    // decided status for its own type" — PENDING for EXPENSE, NEEDS_REVIEW
    // for INCOME — matching evidence.service.ts's upload() check exactly
    // (that's the real enforcement point; this is just the friendlier
    // pre-check so a doomed download is never attempted).
    const notYetDecidedStatus = transaction
      ? transaction.type === "EXPENSE"
        ? "PENDING"
        : "NEEDS_REVIEW"
      : null;

    if (!transaction || transaction.status !== notYetDecidedStatus) {
      const errorReason = !transaction ? "no_recent_transaction" : "recent_transaction_already_decided";

      await this.prisma.lineMessageEvent.create({
        data: {
          lineUserId,
          username: link.username,
          rawText: rawTextForLog,
          status: "EVIDENCE_TARGET_NOT_FOUND",
          errorReason,
        },
      });
      if (event.replyToken) {
        const message =
          errorReason === "recent_transaction_already_decided"
            ? "รายการล่าสุดถูกตรวจสอบไปแล้ว แนบหลักฐานเพิ่มไม่ได้ กรุณาแนบผ่านหน้าเว็บแทน"
            : `ไม่พบรายการที่พึ่งแจ้งไปภายใน ${EVIDENCE_BINDING_WINDOW_MINUTES} นาทีที่ผ่านมา กรุณาพิมพ์แจ้งยอดก่อน แล้วค่อยส่ง${mediaLabel}ตามมาค่ะ`;
        await this.lineClient.reply(event.replyToken, message);
      }
      return;
    }

    const messageId = event.message?.id;
    const fileName = event.message?.fileName;
    // Fallback ONLY used if LINE's response omits Content-Type — see
    // line-client.service.ts's getMessageContent() comment. Guessing an
    // image type for a "file" message here would silently mislabel a
    // PDF; guessing from the reported file name is the closer-to-right
    // fallback, and an unrecognized extension degrades to
    // application/octet-stream, which EvidenceService's allowlist then
    // correctly rejects rather than accepting under the wrong type.
    const fallbackMimeType = mediaKind === "image" ? "image/jpeg" : guessMimeTypeFromFileName(fileName);
    const content = messageId ? await this.lineClient.getMessageContent(messageId, fallbackMimeType) : null;

    if (!content) {
      await this.prisma.lineMessageEvent.create({
        data: {
          lineUserId,
          username: link.username,
          rawText: rawTextForLog,
          status: "EVIDENCE_DOWNLOAD_FAILED",
          transactionId: transaction.id,
          errorReason: "content_download_failed",
        },
      });
      if (event.replyToken) {
        await this.lineClient.reply(event.replyToken, `ดึง${mediaLabel}จาก LINE ไม่สำเร็จ กรุณาลองใหม่ หรือแนบผ่านหน้าเว็บแทน`);
      }
      return;
    }

    try {
      // Reuses EvidenceService.upload() verbatim (same storage,
      // versioning, and audit-log write path a web upload goes through —
      // see evidence.module.ts). A Prisma User row satisfies the
      // AuthenticatedUser interface structurally (id/externalUserId/role/
      // displayName), so `resolved.dbUser` can be passed directly.
      // ALLOWED_MIME_TYPES there (application/pdf, image/jpeg/png/webp)
      // is the real gate — a disallowed type throws and is caught below,
      // never silently accepted.
      await this.evidenceService.upload(resolved.dbUser, transaction.id, {
        originalname: fileName ?? `line-${messageId}.jpg`,
        mimetype: content.mimeType,
        size: content.buffer.length,
        buffer: content.buffer,
      });
    } catch (error) {
      await this.prisma.lineMessageEvent.create({
        data: {
          lineUserId,
          username: link.username,
          rawText: rawTextForLog,
          status: "EVIDENCE_DOWNLOAD_FAILED",
          transactionId: transaction.id,
          errorReason: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        },
      });
      if (event.replyToken) {
        await this.lineClient.reply(event.replyToken, "แนบหลักฐานไม่สำเร็จ กรุณาลองใหม่ หรือแนบผ่านหน้าเว็บแทน");
      }
      return;
    }

    await this.prisma.lineMessageEvent.create({
      data: {
        lineUserId,
        username: link.username,
        rawText: rawTextForLog,
        status: "EVIDENCE_ATTACHED",
        transactionId: transaction.id,
      },
    });

    if (event.replyToken) {
      await this.lineClient.reply(
        event.replyToken,
        `✅ แนบหลักฐานให้รายการ "${transaction.description}" (${thb.format(Number(transaction.amount))} บาท) แล้ว`,
      );
    }
  }
}
