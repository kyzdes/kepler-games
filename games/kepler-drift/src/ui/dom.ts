import { createIcons, Orbit, Gem, Shield, HeartPulse, Crosshair, Flame, Magnet, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowUpRight, ArrowRight, Play, RotateCcw, Wrench, ScanLine, Check, X, Mouse, Keyboard, ChevronRight } from 'lucide';
const iconSet = { Orbit, Gem, Shield, HeartPulse, Crosshair, Flame, Magnet, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowUpRight, ArrowRight, Play, RotateCcw, Wrench, ScanLine, Check, X, Mouse, Keyboard, ChevronRight };
export const icons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.5 } });
export const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
export const time = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`;

export function setText(id: string, value: string): void {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}
