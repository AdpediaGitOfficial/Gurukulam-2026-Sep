import { Module } from "@nestjs/common";
import { CronController, LedgerController } from "./ledger.controller";
import { LedgerService } from "./ledger.service";
import { ContractsService } from "./contracts.service";
import { ReminderCronService } from "./cron.service";

@Module({
  controllers: [LedgerController, CronController],
  providers: [LedgerService, ContractsService, ReminderCronService],
  exports: [LedgerService, ContractsService],
})
export class LedgerModule {}
