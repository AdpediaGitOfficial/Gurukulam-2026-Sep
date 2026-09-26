import { Module } from "@nestjs/common";
import { TrainerMeController } from "./trainer-me.controller";
import { TrainerMeService } from "./trainer-me.service";

@Module({
  controllers: [TrainerMeController],
  providers: [TrainerMeService],
  exports: [TrainerMeService],
})
export class TrainerMeModule {}
