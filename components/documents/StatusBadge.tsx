import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type DocumentStatus = 'processing' | 'ready' | 'failed';

interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

const config: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string }> = {
  processing: {
    label: 'Processing',
    variant: 'secondary',
    dot: 'bg-amber-400 animate-pulse-dot',
  },
  ready: {
    label: 'Ready',
    variant: 'secondary',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    variant: 'secondary',
    dot: 'bg-destructive',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, variant, dot } = config[status];

  return (
    <Badge
      variant={variant}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        status === 'ready' && 'text-emerald-700 bg-emerald-50 border-emerald-200',
        status === 'processing' && 'text-amber-700 bg-amber-50 border-amber-200',
        status === 'failed' && 'text-destructive bg-destructive/10 border-destructive/20',
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
      {label}
    </Badge>
  );
}
