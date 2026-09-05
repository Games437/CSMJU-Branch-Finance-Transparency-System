import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EvidenceService } from './evidence.service';

// No @YearScopeParam() here either — same reasoning as
// TransactionsController's PATCH route: the year has to be looked up
// (from the transaction, or from the evidence row's transaction) before
// it can be checked, so EvidenceService does that lookup + check itself.
@Controller('api/v1')
@UseGuards(AuthGuard, RbacGuard)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('expenses/:transactionId/evidence')
  @Roles(Role.TREASURER, Role.BRANCH_HEAD)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.evidenceService.upload(user, transactionId, file);
  }

  @Get('evidence/:evidenceId')
  @Roles(Role.TREASURER, Role.BRANCH_HEAD)
  // STUDENT deliberately excluded from @Roles() here, not just checked
  // inside the service — the permission-matrix.ts file already marks
  // viewProtectedBill: false for STUDENT, so a request that never should
  // have been made gets a clean 403 at the guard level rather than
  // reaching the service at all.
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalFilename } = await this.evidenceService.download(user, evidenceId);
    res.setHeader('Content-Type', mimeType);
    // inline (not attachment): lets the browser preview PDFs/images
    // rather than forcing a download dialog; filename kept for when it
    // IS saved.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    res.send(buffer);
  }
}
