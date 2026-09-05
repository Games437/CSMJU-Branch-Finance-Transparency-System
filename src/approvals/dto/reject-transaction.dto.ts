import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// reason is REQUIRED, not optional — 03_DETAILED_USER_FLOW.md Section 4
// (Branch Head Approval Flow), step 7: "Require rejection reason when
// rejecting". This is an explicit flow requirement, not something left
// ambiguous the way Void's "with reason" phrasing in the permission
// matrix is — so it is enforced here rather than treated as optional.
export class RejectTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
