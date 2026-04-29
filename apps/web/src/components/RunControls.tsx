import { motion } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

const actionSpring = { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.5 };

const MotionButton = motion.button;

export function RunControls(props: {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  canStart: boolean;
  className?: string;
}) {
  const { running, onStart, onStop, canStart, className } = props;
  const startEnabled = canStart && !running;
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <MotionButton
        type="button"
        onClick={onStart}
        disabled={!startEnabled}
        whileHover={startEnabled ? { scale: 1.02, y: -1 } : undefined}
        whileTap={startEnabled ? { scale: 0.97 } : undefined}
        transition={actionSpring}
        className={cn(
          buttonVariants(),
          'min-w-32 origin-center shadow-[0_0_24px_-8px_rgba(245,158,11,0.4)] will-change-transform'
        )}
      >
        <Play className="h-4 w-4" />
        {running ? 'Running…' : 'Start scan'}
      </MotionButton>
      <MotionButton
        type="button"
        onClick={onStop}
        disabled={!running}
        whileHover={running ? { scale: 1.02, y: -0.5 } : undefined}
        whileTap={running ? { scale: 0.98 } : undefined}
        transition={actionSpring}
        className={cn(buttonVariants({ variant: 'secondary' }), 'origin-center will-change-transform')}
      >
        <Square className="h-3.5 w-3.5" />
        Stop
      </MotionButton>
    </div>
  );
}
