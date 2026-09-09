import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  yearAccountId!: string;

  // DB also enforces `amount > 0` via CHECK constraint (belt-and-braces —
  // this DTO check exists so the caller gets a clear 400 instead of a raw
  // DB constraint error).
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsDateString()
  transactionDate!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
