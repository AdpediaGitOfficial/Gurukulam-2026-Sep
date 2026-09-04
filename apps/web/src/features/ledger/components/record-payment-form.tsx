"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatRupees, fromWire, type InstallmentWithPayments } from "@gurukulam/contracts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { recordPayment } from "@/features/ledger/server/actions";
import { IDLE, type FormState } from "@/lib/form";
import { cn } from "@/lib/cn";

const controlClass =
  "h-12 w-full rounded-tile border border-hairline-strong bg-surface px-4 text-body text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

export interface RecordPaymentFormProps {
  ledgerId: string;
  /** Only rows with something still outstanding — the rest cannot receive money. */
  installments: readonly InstallmentWithPayments[];
}

export function RecordPaymentForm({ ledgerId, installments }: RecordPaymentFormProps) {
  const action = recordPayment.bind(null, ledgerId);
  const [state, submit] = useActionState<FormState, FormData>(action, IDLE);
  const [installmentId, setInstallmentId] = useState(installments[0]?.installmentId ?? "");
  const [mode, setMode] = useState("UPI");

  const selected = installments.find((i) => i.installmentId === installmentId);
  const field = (key: string) => state.fields?.[key];

  if (installments.length === 0) {
    return (
      <Card>
        <CardHeader as="h2" title="Record a payment" />
        <p className="text-body-sm text-ink-muted">
          Every installment on this ledger is paid in full. There is nothing left to receive.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Record a payment"
        description="Collected offline and recorded here — there is no payment gateway."
      />

      {state.status === "error" && state.message !== undefined ? (
        <Alert intent="danger" title="Could not record that" className="mb-5">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "idle" && state.message !== undefined ? (
        <Alert intent="success" title="Recorded" className="mb-5">
          {state.message}
        </Alert>
      ) : null}

      <form action={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-ink">Against installment</span>
          <select
            name="installmentId"
            value={installmentId}
            onChange={(event) => setInstallmentId(event.target.value)}
            className={controlClass}
          >
            {installments.map((installment) => (
              <option key={installment.installmentId} value={installment.installmentId}>
                I{installment.installmentNumber} ·{" "}
                {formatRupees(fromWire(installment.outstandingMinor), { paise: false })} due{" "}
                {new Date(installment.dueDate).toLocaleDateString("en-IN")}
                {installment.status === "OVERDUE" ? " (overdue)" : ""}
              </option>
            ))}
          </select>
          {field("installmentId") === undefined ? null : (
            <span className="text-caption text-danger">{field("installmentId")}</span>
          )}
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-ink">Amount received</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-subtle">
                ₹
              </span>
              <input
                name="amount"
                inputMode="decimal"
                required
                // Defaults to clearing the installment, which is what happens
                // most of the time; a part payment is typed over it.
                defaultValue={
                  selected === undefined
                    ? ""
                    : (fromWire(selected.outstandingMinor) / 100n).toString()
                }
                key={installmentId}
                className={cn(controlClass, "pl-8 font-mono tabular-nums")}
              />
            </div>
            <span className="text-caption text-ink-subtle">
              {selected === undefined
                ? ""
                : `${formatRupees(fromWire(selected.outstandingMinor), { paise: false })} outstanding. More than that is refused.`}
            </span>
            {field("amount") === undefined ? null : (
              <span className="text-caption text-danger">{field("amount")}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-ink">Date received</span>
            <input
              name="paidAt"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={controlClass}
            />
            {field("paidAt") === undefined ? null : (
              <span className="text-caption text-danger">{field("paidAt")}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-ink">Mode</span>
            <select
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className={controlClass}
            >
              <option value="UPI">UPI</option>
              <option value="CREDIT_CARD">Credit card</option>
              <option value="DEBIT_CARD">Debit card</option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-ink">
              {mode === "CASH" ? "Receipt number" : "Transaction ID"}
            </span>
            {/*
              Cash is the one mode with no external reference, which is exactly
              why it needs a physical receipt number instead — otherwise a cash
              receipt is unreconcilable.
            */}
            <input
              name={mode === "CASH" ? "receiptNumber" : "transactionId"}
              required={mode !== "CASH"}
              placeholder={mode === "CASH" ? "RCP-00841" : "UPI-8841203"}
              className={cn(controlClass, "font-mono")}
            />
            {field("transactionId") === undefined ? null : (
              <span className="text-caption text-danger">{field("transactionId")}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-body-sm font-medium text-ink">Bank or handle</span>
            <input
              name="bankOrHandle"
              placeholder="HDFC · name@okhdfc"
              className={controlClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-body-sm font-medium text-ink">Notes</span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Anything worth recording against this receipt…"
              className={cn(controlClass, "h-auto py-3")}
            />
          </label>
        </div>

        <Submit />
      </form>
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="self-end">
      {pending ? "Saving…" : "Save payment"}
    </Button>
  );
}
