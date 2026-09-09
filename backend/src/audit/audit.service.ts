import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PrismaClient } from '@prisma/client';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  yearAccountId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
}

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
}
