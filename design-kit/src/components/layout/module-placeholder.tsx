import { PageHeader } from "@/components/patterns/page-header";
import { PageBody } from "@/components/patterns/page-section";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface ModulePlaceholderProps {
  title: string;
  description: string;
}

/**
 * Scaffolding for modules that share the console chrome but have not been
 * designed yet. Each route stays a real, navigable page.
 */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <PageBody>
      <PageHeader title={title} description={description} />
      <Card padding="none">
        <EmptyState
          icon="apps"
          title="This module is not built out yet"
          description="Compose it from the design system: start with ListPage, FilterToolbar and DataTable."
        />
      </Card>
    </PageBody>
  );
}
