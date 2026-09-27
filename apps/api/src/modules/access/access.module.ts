import { Module } from "@nestjs/common";
import { AccessController, AccountController } from "./access.controller";
import { AdminUsersService, RolesService } from "./access.service";
import { AccountService } from "./account.service";

@Module({
  controllers: [AccessController, AccountController],
  providers: [RolesService, AdminUsersService, AccountService],
})
export class AccessModule {}
