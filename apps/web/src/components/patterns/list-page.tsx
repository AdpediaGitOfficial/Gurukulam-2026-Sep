import type { ReactNode } from "react";

import { ModuleTabs } from "@/components/patterns/module-tabs";
import { PageHeader, type PageHeaderProps } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card, CardFooter } from "@/components/ui/card";

export interface ListPageProps extends PageHeaderProps {
  /** Optional `StatTileGrid` summarising the collection. */
  summary?: ReactNode;
  /** A `FilterToolbar`, rendered above the collection card. */
  toolbar?: ReactNode;
  /** A `DataTable` or any other collection view. */
  children: ReactNode;
  /** A `Pagination`, rendered inside the card footer. */
  pagination?: ReactNode;
}

/**
 * The canonical "collection of records" page: header, filter toolbar, a card
 * wrapping the collection, and pagination.
 *
 * New modules should reach for this before laying out a page by hand — it is
 * what keeps Students, Trainers, Colleges and Question Bank looking like one
 * product.
 */
export function ListPage({ summary, toolbar, children, pagination, ...header }: ListPageProps) {
  return (
    <PageBody>
      <PageHeader {...header} />
      <ModuleTabs />
      {summary}
      {toolbar}
      <Card padding="none" className="min-w-0 overflow-hidden">
        {children}
        {pagination ? <CardFooter className="mt-0 border-t-0 px-6 pb-6">{pagination}</CardFooter> : null}
      </Card>
    </PageBody>
  );
}
