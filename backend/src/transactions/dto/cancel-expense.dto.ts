import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Reason is REQUIRED — same rule as VoidTransactionDto/RejectTransactionDto:
// 01_BUSINESS_RULES_SPECIFICATION.md Section 11 requires any void/cancel
// workflow to carry a reason (no financial transaction is hard-deleted).
export class CancelExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
