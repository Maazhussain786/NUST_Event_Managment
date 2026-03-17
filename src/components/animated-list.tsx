'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type AnimationType = 'fade-up' | 'fade-in' | 'slide-right';

const animations = {
  'fade-up': {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  'fade-in': {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  'slide-right': {
    initial: { opacity: 0, x: -16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
  },
} as const;

export interface AnimatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  animation?: AnimationType;
  staggerDelay?: number;
  className?: string;
}

export function AnimatedList<T>({
  items,
  renderItem,
  keyExtractor,
  animation = 'fade-up',
  staggerDelay = 0.04,
  className,
}: AnimatedListProps<T>) {
  const anim = animations[animation];

  return (
    <div className={cn('space-y-3', className)}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item)}
            initial={anim.initial}
            animate={anim.animate}
            exit={anim.exit}
            transition={{ duration: 0.3, delay: index * staggerDelay, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
