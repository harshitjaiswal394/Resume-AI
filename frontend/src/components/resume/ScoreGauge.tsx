import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
  variant?: 'default' | 'ats';
  className?: string;
}

export function ScoreGauge({ 
  score, 
  size = 120, 
  label, 
  variant = 'default',
  className 
}: ScoreGaugeProps) {
  const [offset, setOffset] = useState(326.7); // Full circumference for r=52
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  
  useEffect(() => {
    const progress = score / 100;
    setOffset(circumference - progress * circumference);
  }, [score, circumference]);

  const getStrokeColor = (s: number) => {
    if (s < 40) return 'var(--color-danger-500)';
    if (s < 70) return 'var(--color-warn-500)';
    return 'var(--color-accent-500)';
  };

  if (variant === 'ats') {
    const atsSize = 80;
    const atsRadius = 34;
    const atsCircumference = 2 * Math.PI * atsRadius;
    const atsOffset = atsCircumference - (score / 100) * atsCircumference;

    return (
      <div className={cn("relative flex items-center justify-center", className)} style={{ width: atsSize, height: atsSize }}>
        <svg width={atsSize} height={atsSize} viewBox="0 0 80 80" className="transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={atsRadius}
            stroke="var(--border-soft)"
            strokeWidth="6"
            fill="transparent"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={atsRadius}
            stroke={getStrokeColor(score)}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={atsCircumference}
            initial={{ strokeDashoffset: atsCircumference }}
            animate={{ strokeDashoffset: atsOffset }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none">{score}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" className="transform -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="var(--border-soft)"
          strokeWidth="10"
          fill="transparent"
        />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          stroke={getStrokeColor(score)}
          strokeWidth="10"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-h2 font-bold leading-none">{score}</span>
        <span className="text-subtle text-[10px] uppercase tracking-wider font-medium mt-1">/ 100</span>
      </div>
      {label && <p className="text-label text-center mt-4">{label}</p>}
    </div>
  );
}
