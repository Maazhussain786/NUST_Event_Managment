'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { useRouter } from 'next/navigation';

const slides = [
  {
    heading: ['Hey', 'Ready for'],
    highlight: 'Tonight?',
    image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80',
  },
  {
    heading: ['Find Your', 'Perfect'],
    highlight: 'Society',
    image: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=600&q=80',
  },
  {
    heading: ['Never Miss', 'An Amazing'],
    highlight: 'Event',
    image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&q=80',
  },
];

const swipeConfidenceThreshold = 8000;
const swipePower = (offset: number, velocity: number) => Math.abs(offset) * velocity;

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
};

export default function OnboardingPage() {
  const [[current, direction], setPage] = useState([0, 0]);
  const router = useRouter();

  const paginate = useCallback((newDir: number) => {
    if (newDir === 1 && current >= slides.length - 1) {
      router.push('/login');
      return;
    }
    if (newDir === -1 && current <= 0) return;
    setPage([current + newDir, newDir]);
  }, [current, router]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = swipePower(info.offset.x, info.velocity.x);
    if (swipe < -swipeConfidenceThreshold) paginate(1);
    else if (swipe > swipeConfidenceThreshold) paginate(-1);
  };

  const slide = slides[current];

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col relative overflow-hidden select-none">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-brand-500/15 blur-[128px] pointer-events-none" />

      {/* Skip */}
      <div className="relative z-20 flex justify-end px-6 pt-14">
        <button
          onClick={() => router.push('/login')}
          className="text-surface-400 text-sm font-medium tracking-wide hover:text-white transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Swipeable Content */}
      <div className="relative z-10 flex-1 flex flex-col px-7 mt-2 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.25 }, scale: { duration: 0.25 } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
            className="flex-1 flex flex-col cursor-grab active:cursor-grabbing"
          >
            {/* Heading */}
            <div>
              {slide.heading.map((line, i) => (
                <h1 key={i} className="text-[2.75rem] leading-[1.1] font-extrabold text-white tracking-tight">
                  {line}
                </h1>
              ))}
              <h1 className="text-[2.75rem] leading-[1.1] font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 bg-clip-text text-transparent italic">
                  {slide.highlight}
                </span>
              </h1>
            </div>

            {/* Rounded image */}
            <div className="mt-8 flex-1 flex items-center justify-center">
              <div className="relative w-full max-w-[320px] aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-glow-lg">
                <img
                  src={slide.image}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-950/70 via-transparent to-surface-950/20" />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step indicators on the left side */}
      <div className="absolute left-7 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setPage([i, i > current ? 1 : -1])}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              i === current
                ? 'border-brand-500 bg-brand-500 text-white scale-110'
                : i < current
                  ? 'border-brand-500/40 bg-brand-500/20 text-brand-400'
                  : 'border-surface-600 text-surface-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Bottom area - swipe hint */}
      <div className="relative z-20 px-7 pb-10 pt-4">
        {/* Swipe indicator */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'w-8 bg-brand-500' : 'w-1.5 bg-surface-600'
              }`}
            />
          ))}
        </div>
        <div className="text-center text-surface-500 text-sm">
          {current === slides.length - 1 ? (
            <div className="space-y-2">
              <button onClick={() => router.push('/login')} className="text-brand-500 font-semibold text-base block mx-auto">
                Sign In →
              </button>
              <button onClick={() => router.push('/home')} className="text-surface-400 text-xs block mx-auto hover:text-white transition-colors">
                Continue as Guest
              </button>
            </div>
          ) : (
            'Swipe left to continue'
          )}
        </div>
      </div>
    </div>
  );
}
