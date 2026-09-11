import { Module } from "@nestjs/common";
import { RequirementsController } from "./requirements.controller";
import { PortalAccessService, RequirementsService } from "./requirements.service";

@Module({
  controllers: [RequirementsController],
  providers: [RequirementsService, PortalAccessService],
  exports: [RequirementsService, PortalAccessService],
})
export class RequirementsModule {}
