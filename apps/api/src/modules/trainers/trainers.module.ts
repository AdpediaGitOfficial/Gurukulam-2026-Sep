import { Module } from "@nestjs/common";
import { TrainersController } from "./trainers.controller";
import { TrainersService } from "./trainers.service";
import { AvailabilityService } from "./availability.service";

@Module({
  controllers: [TrainersController],
  providers: [TrainersService, AvailabilityService],
  exports: [AvailabilityService],
})
export class TrainersModule {}
