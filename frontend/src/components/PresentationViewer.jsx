import React from 'react';
import { motion } from 'framer-motion';

/**
 * PresentationViewer — hardened container for AI-authored HTML.
 * Uses a strict 16:9 bounding box + overflow-hidden safe clipping.
 */
export default function PresentationViewer({ slide, animate = false }) {
  const html = typeof slide?.html === 'string' ? slide.html : '';

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={animate ? { opacity: 1, y: 0 } : false}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[1280px] h-[720px] relative overflow-hidden flex flex-col box-border shadow-2xl rounded-2xl bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] text-white">
        <style>{`
          /* Bulletproof rendering: hide broken/empty images and prevent layout blowouts */
          img:not([src]), img[src=""], img[src="#"] { display: none !important; }
          img { max-width: 100%; height: auto; }
          svg { max-width: 100%; height: auto; }
          * { box-sizing: border-box; }
        `}</style>
        <div
          className="w-full h-full [&>div]:w-full [&>div]:h-full"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </motion.div>
  );
}

