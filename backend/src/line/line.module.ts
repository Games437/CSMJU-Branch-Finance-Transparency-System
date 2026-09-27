import { Module } from "@nestjs/common";
import { EvidenceModule } from "../evidence/evidence.module";
import { LineWebhookController } from "./line-webhook.controller";
import { LineAccountController } from "./line-account.controller";
import { LineService } from "./line.service";
import { LineClientService } from "./line-client.service";
import { LineSignatureGuard } from "./guards/line-signature.guard";

@Module({
  imports: [EvidenceModule], // reuse EvidenceService for photo-as-evidence (see LineService)
  controllers: [LineWebhookController, LineAccountController],
  providers: [LineService, LineClientService, LineSignatureGuard],
})
export class LineModule {}
