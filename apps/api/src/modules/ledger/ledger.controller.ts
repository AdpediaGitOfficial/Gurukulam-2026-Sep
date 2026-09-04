import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  contractQuerySchema, createContractSchema, ledgerQuerySchema, recordPaymentSchema,
  reversePaymentSchema, setScheduleSchema, updateContractSchema,
  type ContractQuery, type CreateContractInput, type LedgerQuery, type Principal,
  type RecordPaymentInput, type ReversePaymentInput, type SetScheduleInput, type UpdateContractInput,
} from "@gurukulam/contracts";
import { LedgerService } from "./ledger.service";
import { ContractsService } from "./contracts.service";
import { ReminderCronService } from "./cron.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, Public, RequirePermission } from "../../common/decorators/principal.decorator";
import { ENV, type Env } from "../../config/env";
import { ApiException } from "../../common/errors";

@Controller("fee-ledger")
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly contracts: ContractsService,
  ) {}

  /** Static segments before ":id" so they are never read as an id. */
  @Get("contracts")
  @RequirePermission("feeLedger", "read")
  listContracts(@CurrentPrincipal() p: Principal, @Query(zodBody(contractQuerySchema)) q: ContractQuery) {
    return this.contracts.list(p, q);
  }

  @Post("contracts")
  @RequirePermission("feeLedger", "edit")
  createContract(@CurrentPrincipal() p: Principal, @Body(zodBody(createContractSchema)) body: CreateContractInput) {
    return this.contracts.create(p, body);
  }

  @Get("contracts/:contractId")
  @RequirePermission("feeLedger", "read")
  getContract(@CurrentPrincipal() p: Principal, @Param("contractId") id: string) {
    return this.contracts.get(p, id);
  }

  @Patch("contracts/:contractId")
  @RequirePermission("feeLedger", "edit")
  updateContract(@CurrentPrincipal() p: Principal, @Param("contractId") id: string, @Body(zodBody(updateContractSchema)) body: UpdateContractInput) {
    return this.contracts.update(p, id, body);
  }

  @Put("contracts/:contractId/schedule")
  @RequirePermission("feeLedger", "edit")
  setContractSchedule(@CurrentPrincipal() p: Principal, @Param("contractId") id: string, @Body(zodBody(setScheduleSchema)) body: SetScheduleInput) {
    return this.contracts.setSchedule(p, id, body);
  }

  @Delete("contracts/:contractId")
  @RequirePermission("feeLedger", "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeContract(@CurrentPrincipal() p: Principal, @Param("contractId") id: string): Promise<void> {
    await this.contracts.remove(p, id);
  }

  /**
   * Recording a payment. There is deliberately no delete anywhere in this
   * controller — a receipt is a financial record, and the correction is the
   * reversing entry below.
   */
  @Post("payments")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("feeLedger", "edit")
  recordPayment(@CurrentPrincipal() p: Principal, @Body(zodBody(recordPaymentSchema)) body: RecordPaymentInput) {
    return this.ledger.recordPayment(p, body);
  }

  @Post("payments/:transactionId/reverse")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("feeLedger", "edit")
  reversePayment(@CurrentPrincipal() p: Principal, @Param("transactionId") id: string, @Body(zodBody(reversePaymentSchema)) body: ReversePaymentInput) {
    return this.ledger.reversePayment(p, id, body);
  }

  /** Who a reminder for this installment would actually reach (invariant 6). */
  @Get("installments/:installmentId/recipient")
  @RequirePermission("feeLedger", "read")
  recipient(@Param("installmentId") id: string) {
    return this.ledger.resolveRecipient(id);
  }

  @Get()
  @RequirePermission("feeLedger", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(ledgerQuerySchema)) q: LedgerQuery) {
    return this.ledger.list(p, q);
  }

  @Get(":ledgerId")
  @RequirePermission("feeLedger", "read")
  get(@CurrentPrincipal() p: Principal, @Param("ledgerId") id: string) {
    return this.ledger.get(p, id);
  }

  @Put(":ledgerId/schedule")
  @RequirePermission("feeLedger", "edit")
  setSchedule(@CurrentPrincipal() p: Principal, @Param("ledgerId") id: string, @Body(zodBody(setScheduleSchema)) body: SetScheduleInput) {
    return this.ledger.setLedgerSchedule(p, id, body);
  }
}

/**
 * The nightly run, behind a shared secret rather than a user session — an
 * external scheduler has no principal to present.
 */
@Controller("cron")
export class CronController {
  constructor(
    private readonly cron: ReminderCronService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post("fee-reminders")
  @HttpCode(HttpStatus.OK)
  async feeReminders(@Headers("x-cron-secret") secret?: string) {
    const expected = this.env.CRON_SHARED_SECRET;
    // Refuse outright when unconfigured: an open endpoint that re-derives every
    // ledger is a denial-of-service handle at best.
    if (!expected) {
      throw ApiException.forbidden("CRON_SHARED_SECRET is not configured on this deployment");
    }
    if (secret !== expected) throw ApiException.unauthenticated("Bad cron secret");
    return this.cron.run();
  }
}
