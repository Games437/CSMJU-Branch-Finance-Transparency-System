import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TransactionStatus, TransactionType } from '@prisma/client';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsUUID()
  yearAccountId?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // AMENDED 2026-09-27 ("ยึด repo กลาง", API-07): the incoming query
  // parameter's own name is bound directly from this DTO property (no
  // @Query('pageSize') alias exists on the controller) — so this used to
  // mean a real client had to send ?pageSize=, while the real
  // api-conventions.md §5 requires ?page=&limit= on the wire (never
  // per_page or pageSize). Renamed to match; the request-side half of
  // this fix that the earlier pass (response meta.limit only) missed.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
