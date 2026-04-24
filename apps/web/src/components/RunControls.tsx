import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RunControls(props: {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  canStart: boolean;
  className?: string;
}) {
  const { running, onStart, onStop, canStart, className } = props;
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <Button type="button" onClick={onStart} disabled={!canStart || running} className="min-w-32">
        <Play className="h-4 w-4" />
        {running ? 'Running…' : 'Start scan'}
      </Button>
      <Button type="button" variant="secondary" onClick={onStop} disabled={!running}>
        <Square className="h-3.5 w-3.5" />
        Stop
      </Button>
    </div>
  );
}
