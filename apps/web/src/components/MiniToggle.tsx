import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const pillSpring = { type: 'spring' as const, stiffness: 500, damping: 34, mass: 0.7 };

type Props = {
  /** true when Chromium runs headless (no window) */
  headless: boolean;
  onHeadless: (v: boolean) => void;
  className?: string;
};

/**
 * Compact toggle: ON = headless, OFF = show browser (headed).
 */
export function MiniToggle({ headless, onHeadless, className }: Props) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Run</span>
      <div className="inline-flex min-w-[10.5rem] rounded-full border border-zinc-700/80 bg-zinc-950/80 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
        <div className="relative flex h-6 w-full min-w-0">
          <motion.div
            className={cn(
              'pointer-events-none absolute inset-y-0 z-0 w-1/2 rounded-full will-change-[left]',
              headless
                ? 'bg-gradient-to-b from-zinc-600 to-zinc-800 shadow-sm'
                : 'bg-gradient-to-b from-sky-500/95 to-sky-700/95 shadow-sm ring-1 ring-sky-400/25'
            )}
            initial={false}
            animate={{ left: headless ? '0%' : '50%' }}
            style={{ x: 0, y: 0 }}
            transition={pillSpring}
          />
          <button
            type="button"
            aria-pressed={headless}
            onClick={() => onHeadless(true)}
            className={cn(
              'relative z-10 min-w-0 flex-1 rounded-full px-2.5 text-[10px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
              headless ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Headless
          </button>
          <button
            type="button"
            aria-pressed={!headless}
            onClick={() => onHeadless(false)}
            className={cn(
              'relative z-10 min-w-0 flex-1 rounded-full px-2.5 text-[10px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
              !headless ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Browser
          </button>
        </div>
      </div>
    </div>
  );
}
