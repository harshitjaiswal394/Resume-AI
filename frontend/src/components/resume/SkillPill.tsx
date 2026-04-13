import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SkillPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  skill: string;
  status: 'present' | 'missing';
  className?: string;
  key?: React.Key;
}

export function SkillPill({ skill, status, className, ...props }: SkillPillProps) {
  return (
    <span 
      className={cn(
        "skill-pill",
        status === 'present' ? "skill-pill-present" : "skill-pill-missing",
        className
      )}
      {...props}
    >
      {skill}
    </span>
  );
}
