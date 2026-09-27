import { Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { Roles } from "../rbac/roles.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { LineService } from "./line.service";

/**
 * The authenticated half of the LINE OA feature — a Treasurer, already
 * logged into the web app (normal AuthGuard/RbacGuard, same as every
 * other controller), asks for a one-time code here and then sends it to
 * the LINE OA to prove the LINE account belongs to them. See
 * schema.prisma's LineLinkCode comment for the full rationale.
 *
 * TREASURER-only for the MVP, matching LineService#handleTransactionReport's
 * own scope decision (see its ASSUMPTION comment) — extend both together
 * if Branch Head support is asked for later.
 */
@Controller("line")
@UseGuards(AuthGuard, RbacGuard)
export class LineAccountController {
  constructor(private readonly lineService: LineService) {}

  @Post("link-codes")
  @Roles(Role.TREASURER)
  generateLinkCode(@CurrentUser() user: AuthenticatedUser) {
    return this.lineService.generateLinkCode(user);
  }

  @Get("link-status")
  @Roles(Role.TREASURER)
  getLinkStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.lineService.getLinkStatus(user);
  }

  @Delete("link")
  @Roles(Role.TREASURER)
  async unlink(@CurrentUser() user: AuthenticatedUser) {
    await this.lineService.unlink(user);
    return { unlinked: true };
  }
}
