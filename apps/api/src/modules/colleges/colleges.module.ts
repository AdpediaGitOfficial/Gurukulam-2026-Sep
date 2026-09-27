import { Module } from "@nestjs/common";
import { CollegesController } from "./colleges.controller";
import { CollegesService } from "./colleges.service";

@Module({ controllers: [CollegesController], providers: [CollegesService] })
export class CollegesModule {}
