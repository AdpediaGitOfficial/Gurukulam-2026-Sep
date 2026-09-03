import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/input";
import { domainTokens } from "@/design-system/tokens";

export interface TopBarUser {
  name: string;
  role: string;
  avatarUrl: string;
}

export interface TopBarProps {
  user: TopBarUser;
}

export function TopBar({ user }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center justify-between gap-6 border-b border-hairline bg-canvas px-4 sm:px-8">
      <SearchField
        id="global-search"
        label="Search cross-module analytics"
        placeholder="Search cross-module analytics..."
        fieldClassName="min-w-32 max-w-[576px] flex-1"
      />

      <div className="flex shrink-0 items-center gap-4 sm:gap-6">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Icon name="bell" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Switch module"
          className="hidden sm:inline-flex"
        >
          <Icon name="apps" />
        </Button>

        <div className="flex items-center gap-3 border-l border-hairline pl-4">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-body text-ink">{user.name}</span>
            <span className="text-overline text-ink-muted uppercase">{user.role}</span>
          </div>
          <Avatar src={user.avatarUrl} name={user.name} ringColor={domainTokens["question-bank"]} />
        </div>
      </div>
    </header>
  );
}
