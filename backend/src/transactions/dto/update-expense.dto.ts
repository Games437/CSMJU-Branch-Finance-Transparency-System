import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

// Deliberately NO yearAccountId field here — moving a transaction to a
// different year after creation is not an "edit", it's the exact IDOR
// pattern Security Model Section 10 names ("Treasurer changing
// yearAccountId to another year"). If that's ever a real need, it should
// be a distinct, audited "transfer" operation, not a silent PATCH field.
export class UpdateExpenseDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
