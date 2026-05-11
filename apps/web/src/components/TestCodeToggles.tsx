import type { TestCodeId } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { ControlTile } from './ControlTile';
import { cn } from '@/lib/utils';

const ORDER: TestCodeId[] = ['BI235', 'BI005', 'BI133', 'BI180', 'BI036', 'MS111'];

/** Vitamin-panel tiles only (same as sidebar `ORDER`); CP004 is the Urine Routine tile. */
export const VITAMIN_PANEL_TEST_CODES: TestCodeId[] = ORDER;

export function TestCodeToggles(props: {
  enabled: Record<TestCodeId, boolean>;
  onChange: (id: TestCodeId, value: boolean) => void;
  onClearAll?: () => void;
  className?: string;
}) {
  const { enabled, onChange, onClearAll, className } = props;
  const anyVitaminOn = ORDER.some((id) => enabled[id]);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Tests (order)</p>
        {onClearAll ? (
          <button
            type="button"
            onClick={onClearAll}
            disabled={!anyVitaminOn}
            className="rounded-md border border-zinc-700/80 bg-zinc-950/80 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            None
          </button>
        ) : null}
      </div>
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
