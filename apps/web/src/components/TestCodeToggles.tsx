import type { TestCodeId } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { ControlTile } from './ControlTile';
import { cn } from '@/lib/utils';

const ORDER: TestCodeId[] = ['BI235', 'BI005', 'BI133', 'BI180', 'BI036'];

export function TestCodeToggles(props: {
  enabled: Record<TestCodeId, boolean>;
  onChange: (id: TestCodeId, value: boolean) => void;
  className?: string;
}) {
  const { enabled, onChange, className } = props;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Tests (order)</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {ORDER.map((id) => (
          <ControlTile
            key={id}
            id={`tc-${id}`}
            compact
            accent={id}
            label={TEST_CODE_LABELS[id]}
            sublabel={id}
            selected={enabled[id]}
            onToggle={() => onChange(id, !enabled[id])}
          />
        ))}
      </div>
    </div>
  );
}

export function atLeastOneTestCodeOn(enabled: Record<TestCodeId, boolean>): boolean {
  return ORDER.some((id) => enabled[id]);
}

export function selectedTestCodesInOrder(enabled: Record<TestCodeId, boolean>): TestCodeId[] {
  return ORDER.filter((id) => enabled[id]);
}
