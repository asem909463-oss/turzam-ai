import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { StarSpinner } from '../src/components/Logo';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { darken, fonts, radius, Theme, withAlpha } from '../src/theme';

type OutcomeKind = 'plan' | 'decide' | 'launch' | 'grow';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const OUTCOMES: { id: OutcomeKind; label: string; detail: string; icon: IconName; instruction: string }[] = [
  { id: 'plan', label: 'Make a plan', detail: 'Turn a goal into clear next steps.', icon: 'map-outline', instruction: 'Create a short milestone plan with practical checkpoints.' },
  { id: 'decide', label: 'Make a decision', detail: 'Compare options and choose a move.', icon: 'git-compare-outline', instruction: 'Compare viable options against clear criteria, recommend one, and name what could change the recommendation.' },
  { id: 'launch', label: 'Launch something', detail: 'Get an idea into the real world.', icon: 'rocket-outline', instruction: 'Shape a focused launch plan, including the smallest useful test and how to learn from it.' },
  { id: 'grow', label: 'Grow what works', detail: 'Find the highest-leverage opportunity.', icon: 'trending-up-outline', instruction: 'Look for the highest-leverage growth opportunities and propose a measurable experiment.' },
];

const HORIZONS = ['This week', 'This month', 'This quarter', 'Keep it flexible'] as const;

export default function OutcomeScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const projectId = typeof routeParams.projectId === 'string' ? routeParams.projectId : '';
  const projectName = typeof routeParams.projectName === 'string' ? routeParams.projectName : '';
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const [kind, setKind] = useState<OutcomeKind>('plan');
  const [goal, setGoal] = useState(projectName ? `Move ${projectName} forward` : '');
  const [success, setSuccess] = useState('');
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>('This month');

  const selected = useMemo(() => OUTCOMES.find((item) => item.id === kind) ?? OUTCOMES[0], [kind]);

  function startOutcome() {
    const objective = goal.trim();
    if (!objective) return;
    const details = [
      `Objective: ${objective}`,
      success.trim() ? `What success looks like: ${success.trim()}` : '',
      `Time horizon: ${horizon.toLowerCase()}.`,
    ].filter(Boolean).join('\n');
    const prompt = [
      `Act as Turzam's Outcome Engine: an experienced, practical operator who helps turn intent into measurable progress. ${selected.instruction}`,
      '',
      details,
      '',
      'Make this useful immediately:',
      '- Start with a one-sentence definition of the outcome.',
      '- Make assumptions visible instead of presenting guesses as facts.',
      '- Give a compact sequence of milestones and concrete actions sized to the time horizon.',
      '- Recommend one first move that can be started in 20 minutes or less.',
      '- Ask at most one clarifying question, and only if the answer would materially change the plan.',
      'Finish with a crisp “First move” line. Do not imply that any action has already been completed.',
    ].join('\n');
    router.replace({ pathname: '/', params: { outcomePrompt: prompt, ...(projectId ? { projectId } : {}) } });
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader title="Outcome Engine" right={<View style={styles.starBadge}><StarSpinner size={12} speed={4200} /></View>} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(360)}>
          <LinearGradient colors={[darken(gradient[0], 0.2), darken(gradient[1], 0.17)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroOrbit}><Ionicons name="sparkles" size={19} color="#FFFFFF" /></View>
            <Text style={styles.eyebrow}>POWERFUL UNDERNEATH. EFFORTLESS ON THE SURFACE.</Text>
            <Text style={styles.heroTitle}>Make the next move count.</Text>
          <Text style={styles.heroCopy}>{projectName ? `Bring this workspace forward. Turzam will use ${projectName}’s saved context to find a clear next move.` : 'Bring the goal. Turzam will help you leave with a sharper outcome and a move you can make today.'}</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(320)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.step}><Text style={styles.stepText}>01</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>What are we moving forward?</Text><Text style={styles.sectionHint}>One clear sentence is enough to start.</Text></View>
          </View>
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. Launch my first paid workshop"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            maxLength={500}
            multiline
            style={styles.goalInput}
            accessibilityLabel="Your goal"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(130).duration(320)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.step}><Text style={styles.stepText}>02</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Choose the kind of progress</Text><Text style={styles.sectionHint}>We’ll shape the first response around it.</Text></View>
          </View>
          <View style={styles.outcomeGrid}>
            {OUTCOMES.map((item) => {
              const active = item.id === kind;
              return (
                <PressableScale
                  key={item.id}
                  onPress={() => setKind(item.id)}
                  scaleTo={0.98}
                  style={[styles.outcomeCard, active && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.10) }]}
                  label={`${item.label}${active ? ', selected' : ''}`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.outcomeIcon, active && { backgroundColor: withAlpha(colors.accent, 0.18) }]}>
                    <Ionicons name={item.icon} size={18} color={active ? colors.accentInk : colors.textDim} />
                  </View>
                  <Text style={[styles.outcomeTitle, active && { color: colors.text }]}>{item.label}</Text>
                  <Text style={styles.outcomeDetail}>{item.detail}</Text>
                  {active ? <Ionicons name="checkmark-circle" size={17} color={colors.accentInk} style={styles.selectedMark} /> : null}
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(190).duration(320)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.step}><Text style={styles.stepText}>03</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Set a horizon</Text><Text style={styles.sectionHint}>A useful timeframe, not a rigid deadline.</Text></View>
          </View>
          <View style={styles.horizonRow}>
            {HORIZONS.map((item) => {
              const active = item === horizon;
              return (
                <PressableScale key={item} onPress={() => setHorizon(item)} haptic={false} style={[styles.horizon, active && { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.12) }]} label={`${item}${active ? ', selected' : ''}`} accessibilityState={{ selected: active }}>
                  <Text style={[styles.horizonText, active && { color: colors.accentInk }]}>{item}</Text>
                </PressableScale>
              );
            })}
          </View>
          <TextInput
            value={success}
            onChangeText={setSuccess}
            placeholder="Optional: what would “done” look like?"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            maxLength={300}
            style={styles.successInput}
            accessibilityLabel="Optional success measure"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(320)} style={styles.finish}>
          <PressableScale disabled={!goal.trim()} onPress={startOutcome} style={[styles.startButton, { backgroundColor: colors.accent, opacity: goal.trim() ? 1 : 0.48 }]} label="Build my outcome">
            <Ionicons name="sparkles" size={18} color={colors.onAccent} />
            <Text style={[styles.startText, { color: colors.onAccent }]}>Build my outcome</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.onAccent} />
          </PressableScale>
          <Text style={styles.privacyNote}>Opens a Founder chat with your brief ready. Nothing is sent until you tap send.</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const make = (t: Theme) => StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 34, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  starBadge: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: withAlpha(t.colors.accent, 0.13) },
  hero: { overflow: 'hidden', padding: 21, minHeight: 190, borderRadius: radius.xl, justifyContent: 'flex-end', gap: 7 },
  heroOrbit: { position: 'absolute', right: 22, top: 19, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.19)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: 'rgba(255,255,255,0.82)', fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 1.3 },
  heroTitle: { color: '#FFFFFF', fontFamily: fonts.display, fontSize: 36, lineHeight: 40, maxWidth: 440 },
  heroCopy: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 20, maxWidth: 520 },
  section: { padding: 16, gap: 12, backgroundColor: withAlpha(t.colors.surface, 0.93), borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.xl },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  step: { width: 34, height: 34, borderRadius: 12, backgroundColor: withAlpha(t.colors.accent, 0.13), alignItems: 'center', justifyContent: 'center' },
  stepText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 12 },
  sectionTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  sectionHint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  goalInput: { minHeight: 82, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.bgElevated, paddingHorizontal: 14, paddingVertical: 12, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  outcomeCard: { flexGrow: 1, flexBasis: '46%', minHeight: 112, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.bgElevated, gap: 5, position: 'relative' },
  outcomeIcon: { width: 30, height: 30, borderRadius: 11, backgroundColor: t.colors.surfaceHi, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  outcomeTitle: { color: t.colors.textDim, fontFamily: fonts.uiBold, fontSize: 14 },
  outcomeDetail: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, lineHeight: 16, paddingRight: 10 },
  selectedMark: { position: 'absolute', top: 10, right: 10 },
  horizonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  horizon: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.bgElevated },
  horizonText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 12 },
  successInput: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.bgElevated, paddingHorizontal: 12, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 13.5 },
  finish: { alignItems: 'center', gap: 9, paddingTop: 2 },
  startButton: { minHeight: 52, alignSelf: 'stretch', paddingHorizontal: 17, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  startText: { fontFamily: fonts.uiBold, fontSize: 15 },
  privacyNote: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 16 },
});
