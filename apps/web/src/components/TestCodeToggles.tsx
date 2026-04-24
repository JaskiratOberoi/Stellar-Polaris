import type { TestCodeId } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const ORDER: TestCodeId[] = ['BI235', 'BI005'];

export function TestCodeToggles(props: {
  enabled: Record<TestCodeId, boolean>;
  onChange: (id: TestCodeId, value: boolean) => void;
  className?: string;
}) {
  const { enabled, onChange, className } = props;
  return (
    <div className={cn('space-y-4', className)}>
      {ORDER.map((id) => (
        <div
          key={id}
          className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-3"
        >
          <div className="space-y-0.5">
            <Label htmlFor={`tc-${id}`} className="text-base text-zinc-100">
              {TEST_CODE_LABELS[id]}
            </Label>
            <p className="text-xs text-zinc-500">Test code: {id}</p>
          </div>
          <Switch
            id={`tc-${id}`}
            checked={enabled[id]}
            onCheckedChange={(v: boolean) => onChange(id, v)}
          />
        </div>
      ))}
    </div>
  );
}

export function atLeastOneTestCodeOn(enabled: Record<TestCodeId, boolean>): boolean {
  return ORDER.some((id) => enabled[id]);
}

export function selectedTestCodesInOrder(enabled: Record<TestCodeId, boolean>): TestCodeId[] {
  return ORDER.filter((id) => enabled[id]);
}
