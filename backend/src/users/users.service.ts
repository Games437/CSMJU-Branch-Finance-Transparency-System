import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveYearAssignments(userId: string) {
    return this.prisma.userYearAssignment.findMany({
      where: { userId, activeTo: null },
      include: { yearAccount: { select: { id: true, yearLevel: true, name: true } } },
    });
  }
}
