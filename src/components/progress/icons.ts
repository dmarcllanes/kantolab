import { createElement } from 'react'
import {
  BookOpen,
  Calendar,
  Code2,
  Cpu,
  Crown,
  Flame,
  FlaskConical,
  Gavel,
  Layers,
  Network,
  Play,
  Rewind,
  ShieldCheck,
  Trophy,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  play: Play,
  wrench: Wrench,
  users: Users,
  shield: ShieldCheck,
  book: BookOpen,
  code: Code2,
  network: Network,
  rewind: Rewind,
  flask: FlaskConical,
  trophy: Trophy,
  gavel: Gavel,
  cpu: Cpu,
  layers: Layers,
  zap: Zap,
  crown: Crown,
  flame: Flame,
  calendar: Calendar,
}

export const iconFor = (key: string): LucideIcon => ICONS[key] ?? Trophy

/** Renders the icon for a key (a stable component, so it's safe inside render). */
export function KeyIcon({ name, className }: { name: string; className?: string }) {
  return createElement(iconFor(name), { className, 'aria-hidden': true })
}
