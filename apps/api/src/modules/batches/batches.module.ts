import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BatchesController } from "./batches.controller";
import { BatchesService } from "./batches.service";
import { SessionsService } from "./sessions.service";
import { AttendanceService } from "./attendance.service";

@Module({
  // Sessions emit events as they change. See `NotificationsService.emit`.
  imports: [NotificationsModule],
  controllers: [BatchesController],
  providers: [BatchesService, SessionsService, AttendanceService],
  exports: [BatchesService, SessionsService, AttendanceService],
})
export class BatchesModule {}
