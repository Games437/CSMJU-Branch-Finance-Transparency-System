import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PrismaClient } from '@prisma/client';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface AuditEntry {
  actorId: string | null;
  // Base standards item #6 — see schema.prisma's UserYearAssignment.username
  // comment for the full rationale. Every call site passes the acting
  // user's externalUserId directly (it's already in hand as
  // AuthenticatedUser.externalUserId); null only for a genuinely
  // system-originated event with no human actor, matching actorId's own
  // nullability.
  actorUsername: string | null;
  action: string;
  targetType: string;
  targetId: string;
  yearAccountId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
}

// Selected/included alongside every audit row returned to a client — the
// raw actorId/yearAccountId UUIDs alone aren't enough for the "Actor"/"Year"
// columns the UI needs (08_UI_UX_INFORMATION_ARCHITECTURE.md Section 7:
// "Timestamp, Actor, Action, Target, Result, Year, Details drawer").
const AUDIT_LOG_INCLUDE = {
  actor: { select: { id: true, externalUserId: true, displayName: true, role: true } },
  yearAccount: { select: { id: true, name: true, yearLevel: true } },
} satisfies Prisma.AuditLogInclude;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit log row. Accepts an optional Prisma transaction client
   * so callers can include the audit write in the SAME atomic transaction
   * as the state change it's recording (Security Model Section 4) — this
   * is not optional decoration, it's what makes the audit trail trustworthy
   * (a state change that succeeds while its audit entry silently fails
   * would defeat the point of Section 17's audit requirements).
   */
  async record(
    entry: AuditEntry,
    client: Pick<PrismaClient, 'auditLog'> = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorUsername: entry.actorUsername,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        yearAccountId: entry.yearAccountId ?? null,
        beforeJson: (entry.beforeJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        afterJson: (entry.afterJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        metadataJson: (entry.metadataJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * GET /audit-logs — branch-wide audit log listing (Branch Head only, per
   * 02_ROLE_PERMISSION_MATRIX.md "View full audit log": Student ✗,
   * Treasurer "limited scoped" (left denied — see permission-matrix.ts's
   * ASSUMPTION comment on viewFullAuditLog, scope never defined), Branch
   * Head ✓). Role enforcement lives on the controller's @Roles() guard,
   * same as everywhere else in this codebase — this method does no
   * role-based filtering itself.
   */
  async list(query: ListAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.yearAccountId) where.yearAccountId = query.yearAccountId;
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;

    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_LOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * GET /transactions/:transactionId/audit — the full decision trail for
   * one transaction (named explicitly in 05_API_SPECIFICATION_OPENAPI.md
   * alongside GET /audit-logs). Oldest-first, unlike list() above: this is
   * read as a narrative of what happened to one record, not a scrollable
   * activity feed, and it's expected to be a handful of rows at most (one
   * per state transition), so no pagination.
   */
  async listForTarget(targetType: string, targetId: string) {
    return this.prisma.auditLog.findMany({
      where: { targetType, targetId },
      include: AUDIT_LOG_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }
}
