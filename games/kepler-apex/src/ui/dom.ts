import { createIcons, Orbit, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowRight, RotateCcw, Play, X, Zap, ArrowLeft, ChevronRight, Flag, Trophy } from 'lucide';
export const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
export const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const icons = () => createIcons({ icons: { Orbit, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowRight, RotateCcw, Play, X, Zap, ArrowLeft, ChevronRight, Flag, Trophy }, attrs: { 'stroke-width': 1.5 } });
