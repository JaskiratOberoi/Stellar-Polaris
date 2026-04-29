import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const modeSpring = { type: 'spring' as const, stiffness: 520, damping: 36, mass: 0.85 };
const textSpring = { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.4 };

type Props = {
  /** true = write / authenticate */
  authenticate: boolean;
  onAuthenticate: (v: boolean) => void;
  idPrefix?: string;
  className?: string;
};

/**
 * Readonly (dry run) vs Authenticate (write mode) — distinct from small toggles.
 */
export function ModeToggle({ authenticate, onAuthenticate, idPrefix = 'mode', className }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-700/90 bg-zinc-950/60 p-1 shadow-inner',
        className
      )}
      role="group"
      aria-label="Run mode"
    >
      <div className="relative flex w-full min-h-0">
        <motion.div
          className={cn(
            'pointer-events-none absolute inset-y-0 z-0 w-1/2 rounded-lg will-change-[left]',
            authenticate
              ? 'bg-amber-500/20 shadow-[0_0_0_1px_rgba(245,158,11,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'bg-zinc-800/95 shadow-sm [box-shadow:0_1px_0_rgba(255,255,255,0.06)]'
          )}
          initial={false}
          animate={{ left: authenticate ? '50%' : '0%' }}
          style={{ x: 0, y: 0 }}
          transition={modeSpring}
        />
        <button
          type="button"
          id={`${idPrefix}-readonly`}
          aria-pressed={!authenticate}
          onClick={() => onAuthenticate(false)}
          className={cn(
            'relative z-10 min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
            !authenticate ? 'text-zinc-100' : 'text-zinc-500'
          )}
        >
          <motion.span
            className="block"
            animate={!authenticate ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 0 }}
            transition={textSpring}
          >
            Readonly
          </motion.span>
          <span
            className={cn('mt-0.5 block text-[10px] font-normal', !authenticate ? 'text-zinc-400' : 'text-zinc-600')}
          >
            Decisions only
          </span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-auth`}
          aria-pressed={authenticate}
          onClick={() => onAuthenticate(true)}
          className={cn(
            'relative z-10 min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
            authenticate ? 'text-amber-50' : 'text-zinc-500'
          )}
        >
          <motion.span
            className="block"
            animate={authenticate ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 0 }}
            transition={textSpring}
          >
            Authenticate
          </motion.span>
          <span
            className={cn(
              'mt-0.5 block text-[10px] font-normal',
              authenticate ? 'text-amber-200/80' : 'text-zinc-600'
            )}
          >
            Writes to LIS
          </span>
        </button>
      </div>
    </div>
  );
}
