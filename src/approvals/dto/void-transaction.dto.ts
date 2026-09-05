import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Reason is REQUIRED: 02_ROLE_PERMISSION_MATRIX.md Section 3 explicitly
// says "Void/reverse transaction | ... | ✓ with reason" for Branch Head.
export class VoidTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
