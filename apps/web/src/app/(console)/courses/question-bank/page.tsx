import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@gurukulam/contracts";
import type { Question } from "@gurukulam/contracts";

import { ListFilters } from "@/components/patterns/list-filters";
import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { listQuestions } from "@/features/questions/server/questions-service";
import { buttonVariants } from "@/components/ui/button";
import { DeleteRecord } from "@/components/patterns/delete-record";
import { requireModule } from "@/server/principal";
import type { SearchParams } from "@/server/list";
import { pageSummary, withParam } from "@/lib/href";
import { feedbackTextTokens } from "@/design-system/tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Question bank" };

const DIFFICULTY = {
  EASY: feedbackTextTokens.success,
  MEDIUM: feedbackTextTokens.warning,
  HARD: feedbackTextTokens.danger,
} as const;

/**
 * One assessment item, shown whole.
 *
 * A question is not a table row: the stem and its options are the content, and
 * truncating either makes the bank unreviewable — which is the one thing this
 * page exists for.
 */
function QuestionCard({
  question,
  mayEdit,
  mayDelete,
}: {
  question: Question;
  mayEdit: boolean;
  mayDelete: boolean;
}) {
  const answers = new Set(question.correctAnswers ?? []);

  return (
    <li className="rounded-tile border border-hairline p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {question.courseName === null || question.courseName === undefined ? null : (
          <Chip>{question.courseName}</Chip>
        )}
        {question.topicTitle === null || question.topicTitle === undefined ? null : (
          <Chip>{question.topicTitle}</Chip>
        )}
        <Chip color={DIFFICULTY[question.difficulty as keyof typeof DIFFICULTY]}>
          {question.difficulty.toLowerCase()}
        </Chip>
        <Chip>{question.questionType.replace(/_/g, " ").toLowerCase()}</Chip>
        <span className="ml-auto text-caption text-ink-subtle tabular-nums">
          {question.marks} {question.marks === 1 ? "mark" : "marks"}
        </span>
        {/* Retiring a question is soft: papers already set from it still
            explain themselves, which is why the API keeps the row. */}
        {mayEdit ? (
          <Link
            href={`/courses/question-bank/${question.questionId}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
        {mayDelete ? (
          <DeleteRecord
            target="question"
            id={question.questionId}
            label="this question"
          />
        ) : null}
      </div>

      <p className="mb-2.5 text-body font-medium text-ink">{question.questionText}</p>

      {question.options === null || question.options.length === 0 ? null : (
        <ol className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option, index) => {
            const correct = answers.has(option.key);
            return (
              <li
                key={option.key}
                className={cn(
                  "rounded-control px-3 py-2 text-body-sm",
                  correct
                    ? "bg-success/10 font-semibold text-success-strong"
                    : "bg-surface-sunken text-ink-muted",
                )}
              >
                {String.fromCharCode(65 + index)}. {option.text}
              </li>
            );
          })}
        </ol>
      )}

      {question.explanation === null ? null : (
        <p className="mt-2.5 border-t border-hairline pt-2.5 text-body-sm text-ink-subtle">
          {question.explanation}
        </p>
      )}
    </li>
  );
}

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const principal = await requireModule("courses");
  const mayEdit = can(principal, "courses", "edit");
  const mayDelete = can(principal, "courses", "delete");
  const params = await searchParams;
  const page = await listQuestions(params);

  return (
    <PageBody>
      <PageHeader
        eyebrow="Courses"
        title="Question bank"
        description="Assessment items by course, topic and difficulty. The bank lives under Courses because assessment belongs to a course."
        action={
          mayEdit ? (
            <Link href="/courses/question-bank/new" className={buttonVariants({ variant: "primary" })}>
              Add a question
            </Link>
          ) : undefined
        }
      />
      <ModuleTabs />

      <ListFilters
        params={params}
        searchPlaceholder="Search question text or tags…"
        selects={[
          {
            name: "difficulty",
            label: "Difficulty",
            options: [
              { value: "", label: "All difficulties" },
              { value: "EASY", label: "Easy" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HARD", label: "Hard" },
            ],
          },
        ]}
      />

      <Card>
        {page.rows.length === 0 ? (
          <EmptyState
            title="No questions match those filters"
            description="Try a broader search term, or clear the difficulty filter."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {page.rows.map((question) => (
              <QuestionCard
                key={question.questionId}
                question={question}
                mayEdit={mayEdit}
                mayDelete={mayDelete}
              />
            ))}
          </ul>
        )}

        <Pagination
          page={page.page}
          pageCount={page.totalPages}
          hrefForPage={(n) => withParam("/courses/question-bank", params, "page", String(n))}
          summary={pageSummary(page.page, page.pageSize, page.total)}
          className="mt-6 border-t border-hairline pt-6"
        />
      </Card>
    </PageBody>
  );
}
