import { Module } from "@nestjs/common";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";
import { AllocationService } from "./allocation.service";

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, AllocationService],
  exports: [StudentsService, AllocationService],
})
export class StudentsModule {}
