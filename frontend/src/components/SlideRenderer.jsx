import React from 'react';
import { motion } from 'framer-motion';

/**
 * Generative UI Renderer — renders AI-authored raw HTML + Tailwind CSS.
 * Fixed 960×540 (16:9) for html2canvas export compatibility.
 *
 * The outer div enforces overflow-hidden + box-border so nothing the AI
 * generates can bleed outside the slide bounds — even rogue absolute elements.
 * The [&>div] selector forces the AI's root div to fill the container.
 */
export default function SlideRenderer({ slide, theme, animate = false }) {
  const bg = theme?.bg || theme?.backgroundColor || '#0b1220';
  const html = typeof slide?.html === 'string' ? slide.html : '';

  return (
    <motion.div
      className="slide-frame"
      style={{ width: 960, height: 540, backgroundColor: bg, overflow: 'hidden', position: 'relative' }}
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={animate ? { opacity: 1, y: 0 } : false}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="w-full h-full relative overflow-hidden flex flex-col box-border [&>div]:w-full [&>div]:h-full [&>div]:overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </motion.div>
  );
}
