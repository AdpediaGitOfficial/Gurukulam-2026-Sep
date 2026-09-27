import { Card } from "@/components/ui/card";
import { Switch, type SwitchProps } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

export interface SettingToggleProps extends SwitchProps {
  className?: string;
}

/**
 * A single on/off setting presented as its own row: name, one line explaining
 * the consequence, and the switch. The sunken card gives each setting a
 * hit area and keeps a stack of them legible.
 */
export function SettingToggle({ className, ...props }: SettingToggleProps) {
  return (
    <Card tone="sunken" padding="none" className={cn("border border-hairline p-4", className)}>
      <Switch {...props} />
    </Card>
  );
}
