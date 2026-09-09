import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AdvanceAcademicYearDto {
  // Free-text label (matches entryAcademicYearLabel's existing type),
  // but constrained to a plausible Thai Buddhist-era year (4 digits,
  // conventionally 25xx) to catch obvious typos early — not a strict
  // format validation since the exact convention wasn't specified.
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'newAcademicYear should be a 4-digit year label, e.g. "2569".' })
  newAcademicYear!: string;
}
