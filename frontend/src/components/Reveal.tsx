import { Children, type ReactNode } from 'react'
import { motion, type Variants } from 'motion/react'
import { reducedMotion } from '../motion'

/*
 * "OLED pop": text lights up the way pixels switch on. It starts dim, soft and slightly low, then
 * sharpens to full brightness. Used once per heading or line as it scrolls into view; never on
 * the console's live data. Motion's MotionConfig (App.tsx) turns it off for reduced motion and
 * for '?still', where everything simply appears finished.
 */

const EASE = [0.23, 1, 0.32, 1] as const

const pop: Variants = {
  hidden: { opacity: 0, y: '0.35em', filter: 'blur(10px) brightness(1.6)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px) brightness(1)', transition: { duration: 0.8, ease: EASE } },
}

/** Pops one block (a heading, a paragraph) into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  if (reducedMotion()) return <div className={className}>{children}</div> // no motion: the text is simply there
  return (
    <motion.div
      className={className}
      variants={pop}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  )
}

/** Pops each child line in turn: for headlines set on deliberate lines. */
export function RevealLines({ children, stagger = 0.14, delay = 0 }: { children: ReactNode; stagger?: number; delay?: number }) {
  if (reducedMotion())
    return (
      <span className="block">
        {Children.map(children, (line) => (
          <span className="block">{line}</span>
        ))}
      </span>
    )
  return (
    <motion.span
      className="block"
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
    >
      {Children.map(children, (line) => (
        <motion.span className="block" variants={pop}>
          {line}
        </motion.span>
      ))}
    </motion.span>
  )
}
