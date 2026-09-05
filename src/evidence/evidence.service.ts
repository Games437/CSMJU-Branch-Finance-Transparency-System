import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Role, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { YearScopeService } from '../rbac/year-scope.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

// Security Model Section 5: "Allowlist MIME/extensions". Deliberately
// narrow — these are the only formats a bill/receipt is realistically
// scanned/photographed as. Extend deliberately, not by request pressure.
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// SANDBOX/MVP STORAGE NOTE: files are written to a local directory
// (LOCAL_STORAGE_ROOT) rather than to S3/GCS/etc. This satisfies Security
// Model Section 5's "server-side storage keys, never trust client
// filename/path" requirement structurally (the key is a random UUID, not
// derived from the upload at all), but local-disk storage does NOT
// satisfy Section 5's "serve through short-lived signed URLs" guidance —
// files are streamed through this API directly. Swapping to real object
// storage later should only require changing this file's read/write
// calls, not the DB schema or the controller.
// ============================================================================
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), 'local-storage', 'evidence');

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yearScope: YearScopeService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    user: AuthenticatedUser,
    transactionId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `File type ${file.mimetype} is not allowed. Allowed types: PDF, JPEG, PNG, WEBP.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new UnsupportedMediaTypeException('File exceeds the 10MB size limit.');
    }

    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found.');
    }
    if (transaction.type !== 'EXPENSE') {
      // Business Rule 6: "บิลเป็นหลักฐานของ Expense" — evidence is an
      // expense concept only.
      throw new ConflictException('Evidence can only be attached to expense transactions.');
    }
    if (transaction.status !== TransactionStatus.PENDING) {
      // ASSUMPTION: not explicitly stated in the spec. Once a transaction
      // has been decided (approved/rejected/voided), allowing new
      // evidence to attach would mean the record a Branch Head actually
      // reviewed no longer matches what's stored — treated as tampering
      // risk rather than a normal edit. Revisit if there's a legitimate
      // post-decision evidence-attachment need (e.g. a receipt arriving
      // late for an already-approved expense).
      throw new ConflictException(
        `Transaction is ${transaction.status}, not PENDING — evidence can no longer be attached.`,
      );
    }

    if (user.role === Role.TREASURER) {
      await this.yearScope.assertCanAccessYear(user, transaction.yearAccountId);
    }

    const storageKey = randomUUID();
    await fs.mkdir(LOCAL_STORAGE_ROOT, { recursive: true });
    await fs.writeFile(path.join(LOCAL_STORAGE_ROOT, storageKey), file.buffer);

    // Business Rule 6 / schema.prisma comment: replacing a bill must not
    // erase history. Close out any current version for this transaction,
    // then insert the new one as the new current version, in one
    // transaction so there's never a moment with zero or two "current"
    // rows.
    const evidence = await this.prisma.$transaction(async (tx) => {
      const previousCurrent = await tx.expenseEvidence.findFirst({
        where: { transactionId, isCurrent: true },
      });

      if (previousCurrent) {
        await tx.expenseEvidence.update({
          where: { id: previousCurrent.id },
          data: { isCurrent: false },
        });
      }

      const created = await tx.expenseEvidence.create({
        data: {
          transactionId,
          storageKey,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedBy: user.id,
          version: (previousCurrent?.version ?? 0) + 1,
          isCurrent: true,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'UPLOAD_BILL',
          targetType: 'Transaction',
          targetId: transactionId,
          yearAccountId: transaction.yearAccountId,
          afterJson: {
            evidenceId: created.id,
            version: created.version,
            originalFilename: created.originalFilename,
            mimeType: created.mimeType,
            sizeBytes: created.sizeBytes,
          },
        },
        tx,
      );

      return created;
    });

    // Never return storageKey to the client (Security Model Section 5:
    // "never trust client filename/path" cuts both ways — don't hand
    // back a raw path they could probe with).
    return {
      id: evidence.id,
      transactionId: evidence.transactionId,
      originalFilename: evidence.originalFilename,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      version: evidence.version,
      uploadedAt: evidence.uploadedAt,
    };
  }

  async download(user: AuthenticatedUser, evidenceId: string) {
    const evidence = await this.prisma.expenseEvidence.findUnique({
      where: { id: evidenceId },
      include: { transaction: true },
    });

    if (!evidence) {
      throw new NotFoundException('Evidence not found.');
    }

    // STUDENT never reaches here at all — @Roles(TREASURER, BRANCH_HEAD)
    // on the controller route blocks it at the guard level (Role Matrix:
    // "View protected bill: ✗/policy" for Student). Only the TREASURER
    // scope check is needed here.
    if (user.role === Role.TREASURER) {
      await this.yearScope.assertCanAccessYear(user, evidence.transaction.yearAccountId);
    }

    const filePath = path.join(LOCAL_STORAGE_ROOT, evidence.storageKey);
    const buffer = await fs.readFile(filePath);

    return {
      buffer,
      mimeType: evidence.mimeType,
      originalFilename: evidence.originalFilename,
    };
  }
}
