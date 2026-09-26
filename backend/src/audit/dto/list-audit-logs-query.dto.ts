import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// No enum for `action`/`targetType` (unlike TransactionType/TransactionStatus
// elsewhere) — AuditEntry.action/targetType are free-form strings written by
// many different call sites (approvals.service.ts, transactions.service.ts,
// evidence.service.ts, year-accounts.service.ts, ...), not a closed set
// defined anywhere in the schema. Validated as plain strings; the frontend
// UI documents the known values it filters by.
export class ListAuditLogsQueryDto {
  @IsOptional()
  @IsUUID()
  yearAccountId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
