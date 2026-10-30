import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ModeId } from './types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ModeInfo = {
  id: ModeId;
  name: string;
  tagline: string;
  icon: IconName;
  /** Fixed colour that reads well on both light and dark backgrounds. */
  color: string;
  suggestions: { title: string; prompt: string }[];
};

export const MODES: ModeInfo[] = [
  {
    id: 'founder',
    name: 'Founder',
    tagline: 'Strategy, pitch, pricing and growth',
    icon: 'rocket',
    color: '#F5A524',
    suggestions: [
      { title: 'Validate my idea', prompt: 'Help me validate a startup idea. Ask me the 5 questions that matter most, then give me a blunt assessment.' },
      { title: 'Investor pitch', prompt: 'Help me write a 10-slide investor pitch outline. Ask me about my product, market and traction first.' },
      { title: 'Cold email', prompt: 'Write a short cold email that gets a reply from a busy decision-maker. Ask me who I am selling to.' },
      { title: 'Pricing strategy', prompt: 'Help me choose a pricing model and price for my product. Ask what I sell and who buys it.' },
      { title: 'Competitor teardown', prompt: 'Run a competitor teardown for my business: positioning, pricing, weaknesses and where I can win. Ask me who the competitors are.' },
      { title: 'My CEO week', prompt: 'Plan my week as a founder. Ask what my top 3 goals are, then build a realistic schedule.' },
      { title: 'First 10 customers', prompt: 'Give me a concrete plan to get my first 10 paying customers. Ask what I sell first.' },
      { title: 'Investor update', prompt: 'Help me write a monthly investor update that is honest, short and builds trust.' },
    ],
  },
  {
    id: 'create',
    name: 'Creative',
    tagline: 'Brand, stories and bold ideas',
    icon: 'color-wand',
    color: '#FF6FA3',
    suggestions: [
      { title: 'Brand story', prompt: 'Write a compelling brand story for my business in under 150 words. Ask me what we do and who we serve.' },
      { title: 'Name ideas', prompt: 'Give me 12 original, memorable names for a new product, with a one-line reason for each. Ask what it does.' },
      { title: 'Short story', prompt: 'Write a 200-word story about a lighthouse keeper who receives a letter from the future.' },
      { title: 'Campaign ideas', prompt: 'Brainstorm 8 unconventional marketing campaign ideas for a small budget. Ask about my product.' },
      { title: 'Rewrite sharper', prompt: 'I will paste a paragraph. Rewrite it to be punchier and more vivid.' },
      { title: 'Taglines', prompt: 'Write 10 taglines for my brand in different tones: bold, warm, playful, premium.' },
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced',
    tagline: 'Fast, friendly, all-round help',
    icon: 'sparkles',
    color: '#2BC3E0',
    suggestions: [
      { title: 'Plan my week', prompt: 'Help me plan a productive week. Ask me 3 quick questions first.' },
      { title: 'Explain simply', prompt: 'Explain how the internet works like I am 12 years old.' },
      { title: 'Draft a message', prompt: 'Help me write a polite message asking my landlord to fix the heating.' },
      { title: 'Decide for me', prompt: 'Help me decide between two options. Ask me what they are and what matters most.' },
      { title: 'Summarise', prompt: 'I will paste or attach a document. Summarise it in 5 bullet points and list the action items.' },
      { title: 'Travel plan', prompt: 'Plan a 3-day trip for me. Ask where I am going and what I enjoy.' },
    ],
  },
  {
    id: 'think',
    name: 'Deep Think',
    tagline: 'Slow, careful, step-by-step reasoning',
    icon: 'bulb',
    color: '#8B6CFF',
    suggestions: [
      { title: 'Weigh a decision', prompt: 'Give me a framework to decide whether to quit my job to start a business, then walk me through it.' },
      { title: 'Solve a puzzle', prompt: 'A farmer has 17 sheep. All but 9 run away. How many are left? Show your reasoning.' },
      { title: 'Find the flaw', prompt: 'Teach me to spot flaws in an argument, with 3 examples.' },
      { title: 'Estimate it', prompt: 'Estimate the market size for a new product I describe, step by step. Ask me what it is.' },
      { title: 'Pre-mortem', prompt: 'Run a pre-mortem on my plan: imagine it failed in a year and tell me the most likely reasons. Ask for the plan first.' },
      { title: 'Break it down', prompt: 'Break a big goal of mine into milestones and first actions. Ask me what the goal is.' },
    ],
  },
  {
    id: 'code',
    name: 'Coder',
    tagline: 'Clean code, exact steps, honest reviews',
    icon: 'code-slash',
    color: '#27B87A',
    suggestions: [
      { title: 'Fix my bug', prompt: 'I will paste an error message. Explain what it means and how to fix it.' },
      { title: 'Learn React Native', prompt: 'Give me a beginner roadmap for React Native with Expo, one step at a time.' },
      { title: 'Review code', prompt: 'I will paste a function. Review it for bugs and suggest improvements.' },
      { title: 'Write a script', prompt: 'Write a PowerShell command that lists the 10 largest files in a folder.' },
      { title: 'Landing page', prompt: 'Write the HTML and CSS for a clean, modern landing page for my product. Ask me what it is.' },
      { title: 'Explain this file', prompt: 'I will attach a code file. Explain what it does and point out risks.' },
    ],
  },
  {
    id: 'tutor',
    name: 'Tutor',
    tagline: 'Patient teaching with quick check-ins',
    icon: 'school',
    color: '#F27A3D',
    suggestions: [
      { title: 'Teach me', prompt: 'Teach me the basics of how money and interest work, then quiz me.' },
      { title: 'Business basics', prompt: 'Teach me unit economics (CAC, LTV, margin) with a simple example, then quiz me.' },
      { title: 'Language practice', prompt: 'Let us practice English conversation. Correct my mistakes gently.' },
      { title: 'Exam prep', prompt: 'Help me prepare for an exam. Ask me what subject and how much time I have.' },
      { title: 'Why is the sky blue?', prompt: 'Why is the sky blue? Explain step by step and check my understanding.' },
      { title: 'Study plan', prompt: 'Build me a 2-week study plan. Ask what I want to learn and how many hours a day I have.' },
    ],
  },
];

export function getMode(id: string | undefined | null): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
