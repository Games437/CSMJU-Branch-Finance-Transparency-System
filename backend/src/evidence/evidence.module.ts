import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService],
  // Exported so LineModule (backend/src/line/) can reuse the exact same
  // upload path — a photo sent to the LINE OA becomes evidence through
  // this same service, not a second copy of the storage/versioning logic.
  exports: [EvidenceService],
})
export class EvidenceModule {}
