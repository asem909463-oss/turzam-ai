import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useSubscription, type PlanTier } from '../context/SubscriptionContext';
import { fonts, radius, Theme, withAlpha } from '../theme';
import { useStyles, useTheme } from '../context/ThemeContext';

type PaywallMode = 'welcome' | 'limit' | 'manage';

type Props = {
  visible: boolean;
  mode: PaywallMode;
  cooldownUntil?: string | null;
  onDismiss: () => void;
};

function timeLeft(until: string | null | undefined, now: number) {
  if (!until) return '6 hours';
  const ms = Math.max(0, Date.parse(until) - now);
  if (!Number.isFinite(ms) || ms <= 0) return 'soon';
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function PremiumPaywall({ visible, mode, cooldownUntil, onDismiss }: Props) {
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const subscription = useSubscription();
  const [expanded, setExpanded] = useState(mode !== 'welcome');
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const isLimit = mode === 'limit';
  const isWelcome = mode === 'welcome';
  const activePlan = subscription.status.plan;
  const canPurchase = subscription.storeAvailable && subscription.status.verificationReady;

  useEffect(() => {
    setExpanded(mode !== 'welcome');
    setNotice(null);
  }, [mode, visible]);

  useEffect(() => {
    if (!visible || !isLimit) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, isLimit]);

  const unavailableReason = useMemo(() => {
    if (!subscription.storeAvailable) {
      return Platform.OS === 'ios'
        ? 'Real Apple purchases require an iOS development build or App Store installation.'
        : 'Apple subscriptions can be purchased in the iOS version of Turzam.';
    }
    if (!subscription.status.verificationReady) {
      return 'Purchases are paused until secure, server-side RevenueCat verification is configured.';
    }
    if (!subscription.packages.plus && !subscription.packages.pro) {
      return 'App Store products are not available yet. Check the App Store Connect products and RevenueCat offering.';
    }
    return null;
  }, [subscription.storeAvailable, subscription.status.verificationReady, subscription.packages.plus, subscription.packages.pro]);

  async function choosePlan(plan: PlanTier) {
    setNotice(null);
    const result = await subscription.purchase(plan);
    if (result.success) {
      setNotice(result.message);
      onDismiss();
    } else if (!result.cancelled) {
      setNotice(result.message);
    }
  }

  async function restore() {
    setNotice(null);
    const result = await subscription.restore();
    setNotice(result.message);
    if (result.success) onDismiss();
  }

  function planCard(plan: PlanTier) {
    const isPro = plan === 'pro';
    const current = activePlan === plan;
    const isHigherActive = activePlan === 'pro' && plan === 'plus';
    const title = isPro ? 'Turzam Pro' : 'Turzam Plus';
    const price = subscription.prices[plan];
    const dailyLimit = isPro ? subscription.status.proChatPerDay : subscription.status.plusChatPerDay;
    const benefits = isPro
      ? [
          `Up to ${dailyLimit.toLocaleString()} AI chats per rolling 24 hours`,
          'No six-hour Free cooldown',
          'Everything in Plus, at Turzam’s highest message tier',
        ]
      : [
          `Up to ${dailyLimit.toLocaleString()} AI chats per rolling 24 hours`,
          'No six-hour Free cooldown',
          'Smarter models from providers connected to Turzam',
        ];
    const planGradient = isPro ? (['#7764F8', '#2C9EDE'] as const) : gradient;
    const packageAvailable = !!subscription.packages[plan];
    const buttonDisabled = !!subscription.busyPlan || !canPurchase || !packageAvailable || current || isHigherActive;

    return (
      <Animated.View key={plan} entering={FadeInDown.delay(isPro ? 120 : 70).duration(350)}>
        <LinearGradient
          colors={isPro ? [withAlpha(planGradient[0], 0.26), withAlpha(planGradient[1], 0.13)] : [withAlpha(planGradient[0], 0.14), withAlpha(planGradient[1], 0.08)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.planCard, isPro && styles.proCard, current && { borderColor: colors.success }]}
        >
          <View style={styles.planTop}>
            <View style={styles.planTitleGroup}>
              <View style={[styles.planIcon, { backgroundColor: withAlpha(planGradient[0], 0.2) }]}>
                <Ionicons name={isPro ? 'diamond' : 'sparkles'} size={18} color={planGradient[0]} />
              </View>
              <View>
                <Text style={styles.planName}>{title}</Text>
                <Text style={styles.planDescriptor}>{isPro ? 'For your most ambitious work' : 'More room for everyday momentum'}</Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: withAlpha(planGradient[0], 0.18) }]}>
              <Text style={[styles.badgeText, { color: planGradient[0] }]}>{current ? 'ACTIVE' : isPro ? 'MAX ACCESS' : 'POPULAR'}</Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}</Text>
            <Text style={styles.perMonth}>/ month</Text>
          </View>

          <View style={styles.benefits}>
            {benefits.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={17} color={planGradient[0]} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          {expanded ? (
            current ? (
              <View style={styles.currentPlan}>
                <Ionicons name="shield-checkmark" size={17} color={colors.success} />
                <Text style={[styles.currentText, { color: colors.success }]}>Your verified plan</Text>
              </View>
            ) : isHigherActive ? (
              <View style={styles.currentPlan}>
                <Ionicons name="checkmark-done-circle" size={17} color={colors.success} />
                <Text style={[styles.currentText, { color: colors.success }]}>Included with Turzam Pro</Text>
              </View>
            ) : (
              <PressableScale
                label={`Choose ${title}`}
                onPress={() => choosePlan(plan)}
                disabled={buttonDisabled}
                style={[styles.planButton, { backgroundColor: planGradient[0] }, buttonDisabled && styles.disabledButton]}
                scaleTo={0.985}
              >
                {subscription.busyPlan === plan ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <>
                    <Text style={[styles.planButtonText, { color: isPro ? '#FFFFFF' : colors.onAccent }]}>
                      {canPurchase && packageAvailable ? `Get ${isPro ? 'Pro' : 'Plus'}` : `Choose ${isPro ? 'Pro' : 'Plus'}`}
                    </Text>
                    <Ionicons name="arrow-forward" size={17} color={isPro ? '#FFFFFF' : colors.onAccent} />
                  </>
                )}
              </PressableScale>
            )
          ) : null}
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Animated.View entering={ZoomIn.duration(260)} style={styles.shell}>
          <LinearGradient colors={[withAlpha(colors.accent, 0.23), withAlpha(colors.accent2, 0.16), colors.bgElevated]} style={styles.modal}>
            <View style={styles.glow} pointerEvents="none" />
            {!isWelcome ? (
              <View style={styles.closeRow}>
                <View style={styles.secureLabel}>
                  <Ionicons name="lock-closed" size={12} color={colors.accentInk} />
                  <Text style={styles.secureText}>SECURE APPLE SUBSCRIPTIONS</Text>
                </View>
                <PressableScale label="Close premium plans" onPress={onDismiss} style={styles.closeButton}>
                  <Ionicons name="close" size={21} color={colors.textDim} />
                </PressableScale>
              </View>
            ) : (
              <View style={[styles.secureLabel, { alignSelf: 'flex-start' }]}>
                <Ionicons name="lock-closed" size={12} color={colors.accentInk} />
                <Text style={styles.secureText}>A MORE POWERFUL TURZAM</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Animated.View entering={FadeIn.duration(300)} style={styles.hero}>
                <LinearGradient colors={[colors.accent, colors.accent2]} style={styles.heroIcon}>
                  <Ionicons name={isLimit ? 'chatbubbles' : 'sparkles'} size={24} color={colors.onAccent} />
                </LinearGradient>
                <Text style={styles.headline}>
                  {isLimit ? 'Want to talk more?' : 'Unlock the full power of Turzam AI.'}
                </Text>
                <Text style={styles.subtitle}>
                  {isLimit
                    ? 'Unlock smarter AI models, more conversations and fewer interruptions with Turzam Plus or Pro.'
                    : 'Get more conversations, smarter AI models and a more powerful personal assistant.'}
                </Text>
              </Animated.View>

              {isLimit ? (
                <View style={styles.cooldownBanner}>
                  <Ionicons name="time-outline" size={18} color={colors.accentInk} />
                  <Text style={styles.cooldownText}>
                    Free access becomes available again in <Text style={styles.cooldownStrong}>{timeLeft(cooldownUntil, now)}</Text>.
                  </Text>
                </View>
              ) : null}

              <View style={styles.plans}>
                {planCard('plus')}
                {planCard('pro')}
              </View>

              {expanded && unavailableReason ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.setupNotice}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textDim} />
                  <Text style={styles.setupText}>{unavailableReason}</Text>
                </Animated.View>
              ) : null}

              {notice ? (
                <Animated.View entering={FadeIn.duration(180)} style={[styles.notice, notice.includes('active') || notice.includes('restored') ? styles.successNotice : null]}>
                  <Text style={styles.noticeText}>{notice}</Text>
                </Animated.View>
              ) : null}

              {expanded ? (
                <PressableScale label="Restore Apple purchases" onPress={restore} disabled={!!subscription.busyPlan || !subscription.storeAvailable} style={styles.restoreButton}>
                  {subscription.busyPlan === 'restore' ? <ActivityIndicator size="small" color={colors.accentInk} /> : <Ionicons name="refresh" size={15} color={colors.accentInk} />}
                  <Text style={styles.restoreText}>Restore Purchases</Text>
                </PressableScale>
              ) : null}

              {activePlan !== 'free' && expanded ? (
                <PressableScale label="Manage Apple subscription" onPress={() => subscription.manageSubscription()} style={styles.manageButton}>
                  <Ionicons name="settings-outline" size={15} color={colors.textDim} />
                  <Text style={styles.manageText}>Manage Subscription in Apple Settings</Text>
                </PressableScale>
              ) : null}

              <Text style={styles.terms}>
                Monthly auto-renewing subscriptions. Payment is charged to your Apple Account and can be managed or cancelled in Apple subscription settings. StoreKit prices shown above are localized for your storefront.
              </Text>

              {isWelcome && !expanded ? (
                <View style={styles.actions}>
                  <PressableScale label="Explore Premium" onPress={() => setExpanded(true)} style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.primaryText, { color: colors.onAccent }]}>Explore Premium</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
                  </PressableScale>
                  <PressableScale label="Continue with Free" onPress={onDismiss} style={styles.freeButton}>
                    <Text style={styles.freeText}>Continue with Free</Text>
                  </PressableScale>
                </View>
              ) : (
                <View style={styles.actions}>
                  <PressableScale label={isWelcome || isLimit ? 'Continue with Free' : 'Close premium plans'} onPress={onDismiss} style={styles.freeButton}>
                    <Text style={styles.freeText}>{isWelcome || isLimit ? 'Continue with Free' : 'Done'}</Text>
                  </PressableScale>
                </View>
              )}
            </ScrollView>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const make = (t: Theme) => {
  const { height } = Dimensions.get('window');
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 18, backgroundColor: t.colors.overlay },
    shell: { width: '100%', maxWidth: 540, maxHeight: Math.min(height * 0.94, 820), borderRadius: 30, overflow: 'hidden', shadowColor: '#02030A', shadowOpacity: 0.38, shadowRadius: 32, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
    modal: { maxHeight: Math.min(height * 0.94, 820), paddingHorizontal: 19, paddingTop: 16, paddingBottom: 16, borderRadius: 30, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.35), overflow: 'hidden' },
    glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: withAlpha(t.colors.accent2, 0.09), top: -160, right: -110 },
    closeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.colors.surface, 0.78), borderWidth: 1, borderColor: t.colors.border },
    secureLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.25), backgroundColor: withAlpha(t.colors.accent, 0.09), paddingHorizontal: 10, paddingVertical: 6 },
    secureText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 9.5, letterSpacing: 1.1 },
    scrollContent: { gap: 14, paddingBottom: 3 },
    hero: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 2, gap: 10 },
    heroIcon: { height: 54, width: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', shadowColor: t.colors.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
    headline: { color: t.colors.text, fontFamily: fonts.display, fontSize: 31, lineHeight: 37, textAlign: 'center', maxWidth: 440 },
    subtitle: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 430 },
    cooldownBanner: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: withAlpha(t.colors.accent, 0.1), borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.26) },
    cooldownText: { flex: 1, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12.5, lineHeight: 18 },
    cooldownStrong: { color: t.colors.text, fontFamily: fonts.uiBold },
    plans: { gap: 11 },
    planCard: { borderRadius: radius.xl, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.28), padding: 14, backgroundColor: withAlpha(t.colors.surface, 0.82), gap: 10 },
    proCard: { borderColor: withAlpha('#7764F8', 0.5) },
    planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    planTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    planIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    planName: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 17 },
    planDescriptor: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
    badgeText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 0.7 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    price: { color: t.colors.text, fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
    perMonth: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12 },
    benefits: { gap: 7 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    benefitText: { flex: 1, color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12.5, lineHeight: 17 },
    planButton: { minHeight: 44, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
    planButtonText: { fontFamily: fonts.uiBold, fontSize: 14 },
    disabledButton: { opacity: 0.52 },
    currentPlan: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    currentText: { fontFamily: fonts.uiBold, fontSize: 13 },
    setupNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: withAlpha(t.colors.surface, 0.76), borderWidth: 1, borderColor: t.colors.border },
    setupText: { flex: 1, color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11.5, lineHeight: 17 },
    notice: { padding: 11, borderRadius: 13, backgroundColor: withAlpha(t.colors.danger, 0.12), borderWidth: 1, borderColor: withAlpha(t.colors.danger, 0.3) },
    successNotice: { backgroundColor: withAlpha(t.colors.success, 0.12), borderColor: withAlpha(t.colors.success, 0.32) },
    noticeText: { color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    restoreButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
    restoreText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 12 },
    manageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
    manageText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 11.5 },
    terms: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 10.5, lineHeight: 15, textAlign: 'center', paddingHorizontal: 5 },
    actions: { gap: 7, paddingTop: 1 },
    primaryButton: { minHeight: 48, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryText: { fontFamily: fonts.uiBold, fontSize: 15 },
    freeButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 15, paddingVertical: 7 },
    freeText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 13 },
  });
};
