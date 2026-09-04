import { Module } from "@nestjs/common";
import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { SubmissionsService } from "./submissions.service";
import { EligibilityService } from "./eligibility.service";

@Module({
  controllers: [CertificatesController],
  providers: [CertificatesService, SubmissionsService, EligibilityService],
  exports: [CertificatesService, EligibilityService],
})
export class CertificatesModule {}
