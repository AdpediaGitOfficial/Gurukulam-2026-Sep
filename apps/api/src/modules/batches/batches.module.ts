import { Module } from "@nestjs/common";
import { BatchesController } from "./batches.controller";
import { BatchesService } from "./batches.service";
import { SessionsService } from "./sessions.service";

@Module({
  controllers: [BatchesController],
  providers: [BatchesService, SessionsService],
  exports: [BatchesService, SessionsService],
})
export class BatchesModule {}
