import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ModeId } from './types';
import { colors } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ModeInfo = {
  id: ModeId;
  name: string;
  tagline: string;
  icon: IconName;
  color: string;
  suggestions: { title: string; prompt: string }[];
};

export const MODES: ModeInfo[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    tagline: 'Fast, friendly, all-round help',
    icon: 'sparkles',
    color: colors.cyan,
    suggestions: [
      { title: 'Plan my week', prompt: 'Help me plan a productive week. Ask me 3 quick questions first.' },
      { title: 'Explain simply', prompt: 'Explain how the internet works like I am 12 years old.' },
      { title: 'Draft a message', prompt: 'Help me write a polite message asking my landlord to fix the heating.' },
      { title: 'Decide for me', prompt: 'Help me decide between learning Python or JavaScript first.' },
    ],
  },
  {
    id: 'think',
    name: 'Deep Think',
    tagline: 'Slow, careful, step-by-step reasoning',
    icon: 'bulb',
    color: colors.violet,
    suggestions: [
      { title: 'Solve a puzzle', prompt: 'A farmer has 17 sheep. All but 9 run away. How many are left? Show your reasoning.' },
      { title: 'Weigh a decision', prompt: 'Give me a framework to decide whether to quit my job to start a business.' },
      { title: 'Find the flaw', prompt: 'Teach me to spot flaws in an argument, with 3 examples.' },
      { title: 'Estimate it', prompt: 'Estimate how many tennis balls fit in a school bus, step by step.' },
    ],
  },
  {
    id: 'create',
    name: 'Creative',
    tagline: 'Stories, ideas and bold writing',
    icon: 'brush',
    color: colors.ember,
    suggestions: [
      { title: 'Short story', prompt: 'Write a 200-word story about a lighthouse keeper who receives a letter from the future.' },
      { title: 'Name ideas', prompt: 'Give me 10 original names for a coffee shop that also sells books.' },
      { title: 'Rewrite sharper', prompt: 'I will paste a paragraph. Rewrite it to be punchier and more vivid.' },
      { title: 'Brainstorm', prompt: 'Brainstorm 8 unusual birthday gift ideas for someone who has everything.' },
    ],
  },
  {
    id: 'code',
    name: 'Coder',
    tagline: 'Clean code, exact steps, honest reviews',
    icon: 'code-slash',
    color: colors.success,
    suggestions: [
      { title: 'Fix my bug', prompt: 'I will paste an error message. Explain what it means and how to fix it.' },
      { title: 'Learn React Native', prompt: 'Give me a beginner roadmap for React Native with Expo, one step at a time.' },
      { title: 'Review code', prompt: 'I will paste a function. Review it for bugs and suggest improvements.' },
      { title: 'Write a script', prompt: 'Write a PowerShell command that lists the 10 largest files in a folder.' },
    ],
  },
  {
    id: 'tutor',
    name: 'Tutor',
    tagline: 'Patient teaching with quick check-ins',
    icon: 'school',
    color: '#FF8FB1',
    suggestions: [
      { title: 'Teach me', prompt: 'Teach me the basics of how money and interest work, then quiz me.' },
      { title: 'Language practice', prompt: 'Let us practice English conversation. Correct my mistakes gently.' },
      { title: 'Exam prep', prompt: 'Help me prepare for an exam. Ask me what subject and how much time I have.' },
      { title: 'Why is the sky blue?', prompt: 'Why is the sky blue? Explain step by step and check my understanding.' },
    ],
  },
];

export function getMode(id: string | undefined | null): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
