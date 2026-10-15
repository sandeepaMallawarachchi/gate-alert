import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TileColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';

interface Props {
  icon: LucideIcon;
  color?: TileColor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconClassName?: string;
  children?: React.ReactNode;
}

const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
const iconSizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };

const IconTile: React.FC<Props> = ({ icon: Icon, color = 'blue', size = 'md', className, iconClassName, children }) => (
  <div
    className={cn('icon-tile relative rounded-full flex items-center justify-center text-primary-foreground shrink-0', sizes[size], className)}
    style={{ ['--tile' as any]: `var(--tile-${color})` }}
  >
    <Icon className={cn(iconSizes[size], iconClassName)} strokeWidth={2.25} />
    {children}
  </div>
);
export default IconTile;
