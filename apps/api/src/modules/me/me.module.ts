import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { CertificatesModule } from "../certificates/certificates.module";

/**
 * `CertificatesModule` is imported for ONE provider: `EligibilityService`.
 *
 * It is the rule that decides whether a certificate can be issued — the
 * attendance denominator, which statuses count, and what an untaken register
 * means. The portal explains that verdict to the student it is about, so it asks
 * the same service rather than counting the rows again: two implementations of
 * one arithmetic is how a portal comes to promise a certificate the console then
 * refuses.
 */
@Module({
  imports: [CertificatesModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
