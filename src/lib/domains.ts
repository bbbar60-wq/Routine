import {
  Briefcase, FlaskConical, Dumbbell, Trophy, HeartPulse,
  GraduationCap, Wallet, Sparkles, type LucideIcon,
} from 'lucide-react';

export type Domain =
  | 'work' | 'research' | 'fitness' | 'sports'
  | 'health' | 'learning' | 'finance' | 'personal';

export interface DomainMeta {
  id: Domain;
  label: string;
  /** CSS variable holding this domain's validated hue for the active theme. */
  varName: string;
  icon: LucideIcon;
}

/**
 * Slot order is the CVD-safety mechanism, not cosmetics: this ordering was run
 * through the data-viz validator in both light and dark mode, and every
 * adjacent pair clears the colour-vision and normal-vision separation floors.
 * Reordering means re-validating.
 */
export const DOMAINS: DomainMeta[] = [
  { id: 'work',     label: 'Work',     varName: '--domain-work',     icon: Briefcase },
  { id: 'fitness',  label: 'Fitness',  varName: '--domain-fitness',  icon: Dumbbell },
  { id: 'health',   label: 'Health',   varName: '--domain-health',   icon: HeartPulse },
  { id: 'learning', label: 'Learning', varName: '--domain-learning', icon: GraduationCap },
  { id: 'personal', label: 'Personal', varName: '--domain-personal', icon: Sparkles },
  { id: 'finance',  label: 'Finance',  varName: '--domain-finance',  icon: Wallet },
  { id: 'research', label: 'Research', varName: '--domain-research', icon: FlaskConical },
  { id: 'sports',   label: 'Sports',   varName: '--domain-sports',   icon: Trophy },
];

export const DOMAIN_IDS = DOMAINS.map((d) => d.id);

const BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));

export function domainMeta(id: string | null | undefined): DomainMeta {
  return BY_ID.get((id ?? 'personal') as Domain) ?? DOMAINS[4];
}

/** The colour to paint a mark for this domain, resolved by the active theme. */
export function domainColor(id: string | null | undefined): string {
  return `var(${domainMeta(id).varName})`;
}

export const domainLabel = (id: string | null | undefined) => domainMeta(id).label;

/** Ordered colour list for charts that need the full categorical set. */
export const domainPalette = DOMAINS.map((d) => `var(${d.varName})`);
