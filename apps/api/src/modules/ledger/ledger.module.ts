import { Module } from "@nestjs/common";
import { CronController, LedgerController } from "./ledger.controller";
import { LedgerService } from "./ledger.service";
import { ContractsService } from "./contracts.service";
import { ReminderCronService } from "./cron.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LedgerController, CronController],
  providers: [LedgerService, ContractsService, ReminderCronService],
  exports: [LedgerService, ContractsService],
})
export class LedgerModule {}
