import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  onToggle: () => void;
  className?: string;
  /** Optional letter/icon slot */
  accent?: string;
  /** Small square grid cell for test codes (2–3 per row) */
  compact?: boolean;
};

export function ControlTile({
  id,
  label,
  sublabel,
  selected,
  onToggle,
  className,
  accent,
  compact = false,
}: Props) {
  const tileTransition = { type: 'spring' as const, stiffness: 450, damping: 28, mass: 0.5 };

  if (compact) {
    return (
      <motion.button
        type="button"
        id={id}
        aria-pressed={selected}
        title={`${label}${sublabel ? ` · ${sublabel}` : ''}`}
        onClick={onToggle}
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={tileTransition}
        className={cn(
          'signal-tile relative flex aspect-square w-full min-w-0 flex-col items-stretch justify-between overflow-hidden rounded-xl border p-2 text-left will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-bg)]',
          'transition-shadow duration-300 ease-out',
          selected
            ? 'border-amber-500/40 bg-amber-500/10 text-zinc-50 shadow-[0_0_20px_-6px_rgba(245,158,11,0.45)]'
            : 'border-zinc-700/70 bg-zinc-950/50 text-zinc-400 hover:border-zinc-500/80 hover:bg-zinc-900/45 hover:shadow-md hover:shadow-black/20',
          className
        )}
      >
        <span className="flex w-full items-start justify-between gap-0.5">
          {accent ? (
            <motion.span
              className={cn(
                'max-w-full truncate rounded-md px-0.5 font-mono text-[8px] font-semibold leading-tight',
                selected ? 'bg-amber-500/20 text-amber-200' : 'bg-zinc-800/90 text-zinc-500'
              )}
              title={accent}
              aria-hidden
              animate={selected ? { scale: 1.03 } : { scale: 1 }}
              transition={tileTransition}
            >
              {accent}
            </motion.span>
          ) : null}
          <motion.span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              selected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]' : 'bg-zinc-600'
            )}
            title={selected ? 'On' : 'Off'}
            animate={selected ? { scale: 1.25 } : { scale: 1 }}
            transition={tileTransition}
          />
        </span>
        <span
          className={cn(
            'line-clamp-2 w-full min-w-0 text-[10px] font-medium leading-tight',
            selected && 'text-zinc-50'
          )}
        >
          {label}
        </span>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      id={id}
      aria-pressed={selected}
      onClick={onToggle}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={tileTransition}
      className={cn(
        'signal-tile group flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-shadow duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-bg)]',
        selected
          ? 'border-amber-500/50 bg-amber-500/15 text-zinc-50 shadow-[0_0_24px_-8px_rgba(245,158,11,0.45)]'
          : 'border-zinc-700/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900/50 hover:text-zinc-300',
        className
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        {accent ? (
          <motion.span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wider',
              selected ? 'bg-amber-500/25 text-amber-200' : 'bg-zinc-800 text-zinc-500'
            )}
            aria-hidden
            animate={selected ? { scale: 1.05 } : { scale: 1 }}
            transition={tileTransition}
          >
            {accent}
          </motion.span>
        ) : null}
        <span className={cn('min-w-0 flex-1 text-sm font-medium', selected && 'text-zinc-50')}>{label}</span>
        <motion.span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            selected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'
          )}
          title={selected ? 'On' : 'Off'}
          animate={selected ? { scale: 1.2 } : { scale: 1 }}
          transition={tileTransition}
        />
      </span>
      {sublabel ? <span className="pl-0 text-[10px] font-mono text-zinc-500">{sublabel}</span> : null}
    </motion.button>
  );
}
