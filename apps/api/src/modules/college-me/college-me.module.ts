import { Module } from "@nestjs/common";
import { CollegeMeController } from "./college-me.controller";
import { CollegeMeService } from "./college-me.service";

@Module({
  controllers: [CollegeMeController],
  providers: [CollegeMeService],
  exports: [CollegeMeService],
})
export class CollegeMeModule {}
