import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // AMENDED 2026-09-27 ("ยึด repo กลาง", DD-01): parameter and query field
  // renamed to localUserId / assigneeId, to avoid the reserved Global
  // Identity alias (data-dictionary.md §9.2 — that name is reserved for
  // the Core Hub `sub` claim, which this is not; it's a local FK into
  // this table's own User row).
  async getActiveYearAssignments(localUserId: string) {
    return this.prisma.userYearAssignment.findMany({
      where: { assigneeId: localUserId, activeTo: null },
      include: { yearAccount: { select: { id: true, yearLevel: true, name: true } } },
    });
  }
}
