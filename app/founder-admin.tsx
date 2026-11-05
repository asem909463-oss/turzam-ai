import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Toggle } from '../src/components/Toggle';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { endFounderSession, founderAdminRequest, hasFounderSession } from '../src/lib/founder-admin';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Section = 'overview' | 'users' | 'controls' | 'health' | 'admins';
type QuotaKind = 'chat' | 'search' | 'aux' | 'transcribe';
type Plan = 'free' | 'premium';
type RuntimeSettings = {
  quotas: Record<Plan, Record<QuotaKind, { perMinute: number; perDay: number }>>;
  models: { gemini: boolean; openai: boolean; anthropic: boolean };
  maintenance: { enabled: boolean; message: string };
  features: { search: boolean; voiceInput: boolean; attachments: boolean; projects: boolean; memory: boolean };
};
type TrendPoint = { date: string; count: number };
type AdminSummary = {
  generatedAt: string;
  registeredUsers: number;
  currentlyActiveUsers: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  newRegistrationsToday: number;
  freeUsers: number;
  premiumUsers: number;
  aiRequests24h: number;
  aiRequests7d: number;
  aiRequests30d: number;
  aiFailures24h: number;
  registrationsDaily: TrendPoint[];
  registrationsWeekly: TrendPoint[];
  registrationsMonthly: TrendPoint[];
  modelUsage: { provider: string; model: string; calls: number; succeeded: number; failed: number }[];
  recentErrors: { code: string | null; occurrences: number; lastSeen: string }[];
  billing: { configured: boolean; activeSubscriptions: number | null; revenue: number | null; currency: string | null };
  health: { database: boolean; checkedAt: string };
};
type AdminUser = {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  account_status: 'active' | 'suspended';
  tier: Plan;
};
type UserPage = { users: AdminUser[]; total: number; page: number; pageSize: number };
type AdminEntry = { userId: string; email: string; displayName: string; role: string; enabled: boolean; createdAt?: string };
type AuditEntry = { id: number; actor_id: string | null; action: string; target_user_id: string | null; details: Record<string, unknown>; created_at: string };

const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid-outline' },
  { id: 'users', label: 'Users', icon: 'people-outline' },
  { id: 'controls', label: 'Controls', icon: 'options-outline' },
  { id: 'health', label: 'Health', icon: 'pulse-outline' },
  { id: 'admins', label: 'Admins', icon: 'shield-checkmark-outline' },
];
const QUOTA_LABELS: Record<QuotaKind, string> = { chat: 'AI chat', search: 'Web search', aux: 'Assistant tools', transcribe: 'Voice input' };
const PLAN_FILTERS = ['all', 'free', 'premium'] as const;
const STATUS_FILTERS = ['all', 'active', 'suspended'] as const;
const PAGE_SIZE = 25;

function number(value: number | undefined): string {
  return new Intl.NumberFormat('en-US').format(Number.isFinite(value) ? Number(value) : 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function make(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { paddingHorizontal: 16, paddingBottom: 42, gap: 14 },
    brandCard: { padding: 18, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.38), borderRadius: radius.lg, backgroundColor: withAlpha(t.colors.surface, 0.93), gap: 8 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: withAlpha(t.colors.accent, 0.18), alignItems: 'center', justifyContent: 'center' },
    eyebrow: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
    brandTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 27, lineHeight: 32 },
    body: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: t.colors.border, backgroundColor: withAlpha(t.colors.surface, 0.82) },
    chipOn: { borderColor: withAlpha(t.colors.accent, 0.62), backgroundColor: withAlpha(t.colors.accent, 0.14) },
    chipText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 12 },
    chipTextOn: { color: t.colors.text, fontFamily: fonts.uiBold },
    nav: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    card: { padding: 15, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: withAlpha(t.colors.surface, 0.92), gap: 8 },
    sectionTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 17 },
    sectionHint: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 17 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metric: { flexGrow: 1, flexBasis: '46%', minWidth: 145, minHeight: 112, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: withAlpha(t.colors.surface, 0.93), justifyContent: 'space-between' },
    metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    metricIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.colors.accent, 0.14) },
    metricLabel: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 11, marginTop: 10 },
    metricValue: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 25, marginTop: 3 },
    small: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11, lineHeight: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    input: { minHeight: 44, borderWidth: 1, borderColor: t.colors.borderStrong, borderRadius: radius.sm, backgroundColor: withAlpha(t.colors.bg, 0.48), paddingHorizontal: 12, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 14 },
    inputSmall: { minHeight: 40, minWidth: 68, borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.sm, backgroundColor: withAlpha(t.colors.bg, 0.5), paddingHorizontal: 8, color: t.colors.text, fontFamily: fonts.ui, fontSize: 13, textAlign: 'center' },
    button: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: t.colors.accent, alignSelf: 'flex-start' },
    buttonText: { color: t.colors.onAccent, fontFamily: fonts.uiBold, fontSize: 13 },
    secondaryButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: t.colors.borderStrong, backgroundColor: withAlpha(t.colors.surface, 0.65) },
    secondaryText: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 11 },
    dangerButton: { borderColor: withAlpha(t.colors.danger, 0.45) },
    dangerText: { color: t.colors.danger, fontFamily: fonts.ui, fontSize: 11 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: withAlpha(t.colors.accent, 0.14) },
    badgeText: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 10, textTransform: 'uppercase' },
    badgeDanger: { backgroundColor: withAlpha(t.colors.danger, 0.12) },
    badgeDangerText: { color: t.colors.danger },
    chart: { height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 12 },
    barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
    bar: { width: '72%', minWidth: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: t.colors.accent },
    userCard: { padding: 14, borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.surface, 0.92), gap: 9 },
    userName: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 14, flex: 1 },
    userEmail: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 12 },
    userMeta: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 10 },
    quotaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.colors.border },
    errorBox: { padding: 13, borderRadius: radius.sm, borderWidth: 1, borderColor: withAlpha(t.colors.danger, 0.38), backgroundColor: withAlpha(t.colors.danger, 0.08) },
    noticeBox: { padding: 13, borderRadius: radius.sm, borderWidth: 1, borderColor: withAlpha(t.colors.accent, 0.32), backgroundColor: withAlpha(t.colors.accent, 0.08) },
    mono: { color: t.colors.textDim, fontFamily: 'monospace', fontSize: 11 },
    divider: { height: 1, backgroundColor: t.colors.border, marginVertical: 2 },
  });
}

export default function FounderAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(make);
  const [section, setSection] = useState<Section>('overview');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [trend, setTrend] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [planFilter, setPlanFilter] = useState<(typeof PLAN_FILTERS)[number]>('all');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [founderEntry, setFounderEntry] = useState<AdminEntry | null>(null);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState<Record<Plan, Record<QuotaKind, string>> | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');

  const loadDashboard = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [summaryResult, settingsResult] = await Promise.all([
        founderAdminRequest<{ summary: AdminSummary }>('summary'),
        founderAdminRequest<{ settings: RuntimeSettings }>('settings'),
      ]);
      setSummary(summaryResult.summary);
      setSettings(settingsResult.settings);
      setQuotaDraft({
        free: Object.fromEntries((Object.keys(settingsResult.settings.quotas.free) as QuotaKind[]).map((k) => [k, String(settingsResult.settings.quotas.free[k].perDay)])) as Record<QuotaKind, string>,
        premium: Object.fromEntries((Object.keys(settingsResult.settings.quotas.premium) as QuotaKind[]).map((k) => [k, String(settingsResult.settings.quotas.premium[k].perDay)])) as Record<QuotaKind, string>,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Founder admin data is unavailable.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await founderAdminRequest<UserPage>('users', {
        search,
        status: statusFilter,
        tier: planFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      setUsers(result.users ?? []);
      setUserTotal(result.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users.');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [page, planFilter, search, statusFilter]);

  const loadAdminsAndAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const [adminResult, auditResult] = await Promise.all([
        founderAdminRequest<{ founder: AdminEntry | null; admins: AdminEntry[]; canManage: boolean }>('admins'),
        founderAdminRequest<{ entries: AuditEntry[] }>('audit'),
      ]);
      setFounderEntry(adminResult.founder);
      setAdmins(adminResult.admins ?? []);
      setCanManageAdmins(adminResult.canManage === true);
      setAuditEntries(auditResult.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load security records.');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFounderSession()) {
      router.replace('/');
      return;
    }
    void loadDashboard();
  }, [loadDashboard, router]);
  useEffect(() => {
    if (!hasFounderSession()) router.replace('/');
  }, [error, router]);
  useEffect(() => {
    if (section !== 'users') return;
    const timer = setTimeout(() => { void loadUsers(); }, 280);
    return () => clearTimeout(timer);
  }, [section, loadUsers]);
  useEffect(() => {
    if (section === 'admins' || section === 'health') void loadAdminsAndAudit();
  }, [section, loadAdminsAndAudit]);
  useFocusEffect(useCallback(() => () => { void endFounderSession().catch(() => {}); }, []));

  const trendPoints = useMemo(() => {
    if (!summary) return [];
    return trend === 'daily' ? summary.registrationsDaily : trend === 'weekly' ? summary.registrationsWeekly : summary.registrationsMonthly;
  }, [summary, trend]);

  async function saveSettings(patch: Partial<RuntimeSettings>, message: string) {
    setSaving(true);
    setNotice(null);
    try {
      const result = await founderAdminRequest<{ settings: RuntimeSettings }>('update_settings', { patch });
      setSettings(result.settings);
      setNotice(message);
      await loadDashboard(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveQuotas() {
    if (!settings || !quotaDraft) return;
    const quotas = { ...settings.quotas };
    for (const tier of ['free', 'premium'] as const) {
      for (const kind of ['chat', 'search', 'aux', 'transcribe'] as const) {
        const value = Number(quotaDraft[tier][kind]);
        if (!Number.isSafeInteger(value) || value < 1 || value > 5000) {
          setError('Daily limits must be whole numbers from 1 to 5,000.');
          return;
        }
        quotas[tier] = { ...quotas[tier], [kind]: { ...quotas[tier][kind], perDay: value } };
      }
    }
    await saveSettings({ quotas }, 'Daily limits saved.');
  }

  function confirmUserChange(target: AdminUser, patch: { status?: 'active' | 'suspended'; tier?: Plan }) {
    const action = patch.status === 'suspended' ? 'Suspend account?' : patch.status === 'active' ? 'Reactivate account?' : 'Change premium access?';
    const detail = patch.status === 'suspended'
      ? `${target.email} will be blocked from signing in and using existing app data.`
      : patch.status === 'active'
        ? `${target.email} will be able to sign in and use the app again.`
        : `Set ${target.email} to ${patch.tier === 'premium' ? 'premium access' : 'free access'}. This changes access only; no payment is processed.`;
    Alert.alert(action, detail, [
      { text: 'Cancel', style: 'cancel' },
      { text: patch.status === 'suspended' ? 'Suspend' : patch.status === 'active' ? 'Reactivate' : 'Confirm', style: patch.status === 'suspended' ? 'destructive' : 'default', onPress: () => { void updateUser(target, patch); } },
    ]);
  }

  async function updateUser(target: AdminUser, patch: { status?: 'active' | 'suspended'; tier?: Plan }) {
    setSaving(true);
    setNotice(null);
    try {
      await founderAdminRequest('set_user', { userId: target.user_id, ...patch });
      setNotice(patch.status ? `Account ${patch.status}.` : `Access set to ${patch.tier}.`);
      await Promise.all([loadUsers(), loadDashboard(false)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the account.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteUser(target: AdminUser) {
    Alert.alert(
      'Permanently delete account?',
      `This removes ${target.email}, their sign-in, and stored files. This cannot be undone. Private conversations are not opened or shown to administrators.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { void deleteUser(target); } },
      ],
    );
  }

  async function deleteUser(target: AdminUser) {
    setSaving(true);
    setNotice(null);
    try {
      await founderAdminRequest('delete_user', { userId: target.user_id, confirm: 'DELETE' });
      setNotice('Account and stored files deleted.');
      await Promise.all([loadUsers(), loadDashboard(false)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account.');
    } finally {
      setSaving(false);
    }
  }

  async function publishAnnouncement() {
    setSaving(true);
    try {
      await founderAdminRequest('announcement', { title: announcementTitle, body: announcementBody });
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setNotice('Announcement published in-app for users. Push delivery is not configured.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the announcement.');
    } finally {
      setSaving(false);
    }
  }

  async function setAdmin(email: string, enabled: boolean) {
    setSaving(true);
    try {
      await founderAdminRequest('set_admin', { email, enabled });
      setAdminEmail('');
      setNotice(enabled ? 'Administrator access granted.' : 'Administrator access removed.');
      await loadAdminsAndAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update administrator access.');
    } finally {
      setSaving(false);
    }
  }

  function confirmAdminRemoval(target: AdminEntry) {
    Alert.alert('Remove administrator?', `Revoke dashboard access for ${target.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove access', style: 'destructive', onPress: () => { void setAdmin(target.email, false); } },
    ]);
  }

  async function lockPanel() {
    try {
      await endFounderSession();
    } catch {
      // The local session is still cleared; navigation must remain available offline.
    } finally {
      router.replace('/');
    }
  }

  const metric = (label: string, value: number, icon: IconName, hint?: string) => (
    <View key={label} style={styles.metric}>
      <View style={styles.metricTop}>
        <View style={styles.metricIcon}><Ionicons name={icon} size={17} color={colors.accentInk} /></View>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{number(value)}</Text>
      {hint ? <Text style={styles.small}>{hint}</Text> : null}
    </View>
  );

  if (!hasFounderSession()) return null;

  return (
    <View style={styles.screen}>
      <Aurora />
      <ScreenHeader
        title="Founder control"
        right={<PressableScale onPress={() => { void loadDashboard(); }} label="Refresh dashboard" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="refresh-outline" size={20} color={colors.text} /></PressableScale>}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadDashboard(); }} tintColor={colors.accent} />}
      >
        <View style={styles.brandCard}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Ionicons name="analytics-outline" size={21} color={colors.accentInk} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Turzam AI · Founder Admin</Text>
              <Text style={styles.brandTitle}>Control center</Text>
            </View>
            <PressableScale onPress={() => { void lockPanel(); }} label="Lock founder panel" style={{ padding: 8 }}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
            </PressableScale>
          </View>
          <Text style={styles.body}>Live operations, access, and product controls. User conversation content and credentials are never exposed here.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
          {SECTIONS.map((item) => {
            const active = section === item.id;
            return (
              <PressableScale key={item.id} onPress={() => setSection(item.id)} label={`${item.label} section`} style={[styles.chip, active && styles.chipOn]}>
                <Ionicons name={item.icon} size={14} color={active ? colors.accentInk : colors.textDim} />
                <Text style={[styles.chipText, active && styles.chipTextOn]}>{item.label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {notice ? <View style={styles.noticeBox}><Text style={styles.body}>{notice}</Text></View> : null}
        {error ? <View style={styles.errorBox}><Text style={[styles.body, { color: colors.danger }]}>{error}</Text><PressableScale onPress={() => setError(null)} label="Dismiss error" style={{ alignSelf: 'flex-end', paddingTop: 6 }}><Text style={[styles.small, { color: colors.danger }]}>Dismiss</Text></PressableScale></View> : null}
        {loading && !summary ? <View style={[styles.card, { alignItems: 'center', paddingVertical: 26 }]}><ActivityIndicator color={colors.accent} /><Text style={styles.small}>Loading live database metrics…</Text></View> : null}

        {section === 'overview' && summary ? (
          <>
            <View style={styles.grid}>
              {metric('Registered users', summary.registeredUsers, 'people-outline')}
              {metric('Active now', summary.currentlyActiveUsers, 'radio-outline', 'Foreground heartbeat, last 5 min')}
              {metric('Daily active', summary.dailyActiveUsers, 'today-outline')}
              {metric('Weekly active', summary.weeklyActiveUsers, 'calendar-outline')}
              {metric('Monthly active', summary.monthlyActiveUsers, 'calendar-number-outline')}
              {metric('New today', summary.newRegistrationsToday, 'person-add-outline')}
              {metric('Free access', summary.freeUsers, 'person-outline')}
              {metric('Premium access', summary.premiumUsers, 'diamond-outline')}
              {metric('AI model calls · 24h', summary.aiRequests24h, 'flash-outline')}
              {metric('Failed calls · 24h', summary.aiFailures24h, 'warning-outline')}
            </View>

            <View style={styles.card}>
              <View style={styles.spread}>
                <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Registration growth</Text><Text style={styles.small}>Aggregated from authenticated account creation dates.</Text></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 7, marginTop: 3 }}>
                {(['daily', 'weekly', 'monthly'] as const).map((value) => (
                  <PressableScale key={value} onPress={() => setTrend(value)} label={`${value} growth chart`} style={[styles.chip, trend === value && styles.chipOn]}>
                    <Text style={[styles.chipText, trend === value && styles.chipTextOn]}>{value[0].toUpperCase() + value.slice(1)}</Text>
                  </PressableScale>
                ))}
              </View>
              {trendPoints.length ? (
                <View style={styles.chart} accessibilityLabel={`${trend} registration chart`}>
                  {trendPoints.map((point) => {
                    const maximum = Math.max(1, ...trendPoints.map((x) => x.count));
                    const height = Math.max(4, Math.round((point.count / maximum) * 104));
                    return <View key={point.date} style={styles.barSlot} accessible accessibilityLabel={`${point.date}: ${number(point.count)} registrations`}><View style={[styles.bar, { height, opacity: point.count ? 1 : 0.32 }]} /></View>;
                  })}
                </View>
              ) : <Text style={styles.small}>No registration history returned.</Text>}
              <Text style={styles.small}>Latest data: {formatDateTime(summary.generatedAt)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Membership and billing</Text>
              <View style={styles.row}><View style={[styles.badge, styles.badgeDanger]}><Text style={[styles.badgeText, styles.badgeDangerText]}>Billing not connected</Text></View></View>
              <Text style={styles.body}>Subscriptions are not available yet and are coming soon. Premium access is an admin-managed entitlement in this app; no payment provider or subscription ledger is configured, so paid subscriptions and revenue are unavailable.</Text>
            </View>
          </>
        ) : null}

        {section === 'users' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>User directory</Text>
              <Text style={styles.sectionHint}>Real Supabase Auth accounts and profile names. Search uses name/email; conversation data is not queried.</Text>
              <TextInput value={search} onChangeText={(value) => { setPage(1); setSearch(value); }} placeholder="Search name or email" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="none" />
              <Text style={styles.small}>Status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {STATUS_FILTERS.map((value) => <PressableScale key={value} onPress={() => { setStatusFilter(value); setPage(1); }} label={`${value} accounts`} style={[styles.chip, statusFilter === value && styles.chipOn]}><Text style={[styles.chipText, statusFilter === value && styles.chipTextOn]}>{value}</Text></PressableScale>)}
              </View>
              <Text style={styles.small}>Access tier</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {PLAN_FILTERS.map((value) => <PressableScale key={value} onPress={() => { setPlanFilter(value); setPage(1); }} label={`${value} access accounts`} style={[styles.chip, planFilter === value && styles.chipOn]}><Text style={[styles.chipText, planFilter === value && styles.chipTextOn]}>{value}</Text></PressableScale>)}
              </View>
            </View>
            <View style={styles.spread}><Text style={styles.sectionTitle}>{number(userTotal)} accounts</Text>{usersLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}</View>
            {users.map((item) => (
              <View key={item.user_id} style={styles.userCard}>
                <View style={styles.spread}>
                  <Text numberOfLines={1} style={styles.userName}>{item.display_name || 'Unnamed account'}</Text>
                  <View style={[styles.badge, item.account_status === 'suspended' && styles.badgeDanger]}><Text style={[styles.badgeText, item.account_status === 'suspended' && styles.badgeDangerText]}>{item.account_status}</Text></View>
                </View>
                <Text selectable style={styles.userEmail}>{item.email}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <View style={styles.badge}><Text style={styles.badgeText}>{item.tier}</Text></View>
                  <Text style={styles.userMeta}>Joined {formatDate(item.created_at)}</Text>
                  <Text style={styles.userMeta}>Last sign-in {formatDate(item.last_sign_in_at)}</Text>
                </View>
                <Text selectable style={styles.mono}>{item.user_id}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  <PressableScale onPress={() => confirmUserChange(item, { tier: item.tier === 'premium' ? 'free' : 'premium' })} label={item.tier === 'premium' ? 'Set free access' : 'Grant premium access'} style={styles.secondaryButton}>
                    <Ionicons name="diamond-outline" size={14} color={colors.accentInk} /><Text style={styles.secondaryText}>{item.tier === 'premium' ? 'Set free' : 'Set premium'}</Text>
                  </PressableScale>
                  <PressableScale onPress={() => confirmUserChange(item, { status: item.account_status === 'suspended' ? 'active' : 'suspended' })} label={item.account_status === 'suspended' ? 'Reactivate account' : 'Suspend account'} style={[styles.secondaryButton, item.account_status !== 'suspended' && styles.dangerButton]}>
                    <Ionicons name={item.account_status === 'suspended' ? 'checkmark-circle-outline' : 'pause-circle-outline'} size={14} color={item.account_status === 'suspended' ? colors.success : colors.danger} />
                    <Text style={[styles.secondaryText, item.account_status !== 'suspended' && styles.dangerText]}>{item.account_status === 'suspended' ? 'Reactivate' : 'Suspend'}</Text>
                  </PressableScale>
                  <PressableScale onPress={() => confirmDeleteUser(item)} label="Permanently delete account" style={[styles.secondaryButton, styles.dangerButton]}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} /><Text style={styles.dangerText}>Delete</Text>
                  </PressableScale>
                </View>
              </View>
            ))}
            {!usersLoading && users.length === 0 ? <View style={styles.card}><Text style={styles.body}>No accounts match these filters.</Text></View> : null}
            <View style={styles.spread}>
              <PressableScale disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} label="Previous users" style={[styles.secondaryButton, page <= 1 && { opacity: 0.45 }]}><Ionicons name="chevron-back" size={14} color={colors.text} /><Text style={styles.secondaryText}>Previous</Text></PressableScale>
              <Text style={styles.small}>Page {page} of {Math.max(1, Math.ceil(userTotal / PAGE_SIZE))}</Text>
              <PressableScale disabled={page >= Math.ceil(userTotal / PAGE_SIZE)} onPress={() => setPage((p) => p + 1)} label="Next users" style={[styles.secondaryButton, page >= Math.ceil(userTotal / PAGE_SIZE) && { opacity: 0.45 }]}><Text style={styles.secondaryText}>Next</Text><Ionicons name="chevron-forward" size={14} color={colors.text} /></PressableScale>
            </View>
          </>
        ) : null}

        {section === 'controls' && settings && quotaDraft ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Daily AI limits</Text>
              <Text style={styles.sectionHint}>Enforced server-side by the chat Edge Function. Existing per-minute and global safety caps remain in effect.</Text>
              {(['free', 'premium'] as const).map((tier) => (
                <View key={tier} style={{ marginTop: 6 }}>
                  <Text style={[styles.eyebrow, { marginBottom: 4 }]}>{tier} tier</Text>
                  {(['chat', 'search', 'aux', 'transcribe'] as const).map((kind) => (
                    <View key={`${tier}-${kind}`} style={styles.quotaRow}>
                      <Text style={[styles.body, { flex: 1 }]}>{QUOTA_LABELS[kind]}</Text>
                      <TextInput
                        value={quotaDraft[tier][kind]}
                        onChangeText={(value) => setQuotaDraft((old) => old ? { ...old, [tier]: { ...old[tier], [kind]: value.replace(/[^0-9]/g, '').slice(0, 4) } } : old)}
                        keyboardType="number-pad"
                        maxLength={4}
                        style={styles.inputSmall}
                        accessibilityLabel={`${tier} ${QUOTA_LABELS[kind]} daily limit`}
                      />
                      <Text style={styles.small}>/ day</Text>
                    </View>
                  ))}
                </View>
              ))}
              <PressableScale disabled={saving} onPress={() => { void saveQuotas(); }} label="Save quota settings" style={[styles.button, saving && { opacity: 0.65 }]}>
                {saving ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name="save-outline" size={16} color={colors.onAccent} />}<Text style={styles.buttonText}>Save daily limits</Text>
              </PressableScale>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>AI model availability</Text>
              {(['gemini', 'openai', 'anthropic'] as const).map((provider) => (
                <View key={provider} style={[styles.spread, { paddingVertical: 5 }]}>
                  <View style={{ flex: 1 }}><Text style={styles.body}>{provider === 'openai' ? 'ChatGPT / OpenAI' : provider === 'anthropic' ? 'Claude / Anthropic' : 'Gemini'}</Text><Text style={styles.small}>Also requires its server-side provider key.</Text></View>
                  <Toggle value={settings.models[provider]} label={`${provider === 'openai' ? 'ChatGPT / OpenAI' : provider === 'anthropic' ? 'Claude / Anthropic' : 'Gemini'} availability`} onChange={(enabled) => { void saveSettings({ models: { [provider]: enabled } as RuntimeSettings['models'] }, `${provider} availability updated.`); }} />
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.spread}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Maintenance mode</Text><Text style={styles.sectionHint}>Blocks AI actions server-side while leaving founder admin available.</Text></View><Toggle value={settings.maintenance.enabled} label="Maintenance mode" onChange={(enabled) => { void saveSettings({ maintenance: { ...settings.maintenance, enabled } }, enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.'); }} /></View>
              <TextInput value={settings.maintenance.message} onChangeText={(message) => setSettings((old) => old ? { ...old, maintenance: { ...old.maintenance, message } } : old)} placeholder="Maintenance message" placeholderTextColor={colors.textFaint} style={[styles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={280} />
              <PressableScale disabled={saving} onPress={() => { void saveSettings({ maintenance: settings.maintenance }, 'Maintenance message saved.'); }} label="Save maintenance message" style={styles.secondaryButton}><Ionicons name="save-outline" size={14} color={colors.text} /><Text style={styles.secondaryText}>Save message</Text></PressableScale>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>App features</Text>
              <Text style={styles.sectionHint}>These controls are enforced by Edge Function checks and Supabase row/storage policies where applicable.</Text>
              {([
                ['search', 'Web search'], ['voiceInput', 'Voice input'], ['attachments', 'File attachments'], ['projects', 'Project workspaces'], ['memory', 'User memory'],
              ] as [keyof RuntimeSettings['features'], string][]).map(([key, label]) => (
                <View key={key} style={[styles.spread, { paddingVertical: 5 }]}><Text style={styles.body}>{label}</Text><Toggle value={settings.features[key]} label={label} onChange={(enabled) => { void saveSettings({ features: { [key]: enabled } as RuntimeSettings['features'] }, `${label} ${enabled ? 'enabled' : 'disabled'}.`); }} /></View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>In-app announcement</Text>
              <Text style={styles.sectionHint}>Shown in the app when users open chat. Push notification delivery is not configured in the existing app.</Text>
              <TextInput value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Announcement title" placeholderTextColor={colors.textFaint} style={styles.input} maxLength={100} />
              <TextInput value={announcementBody} onChangeText={setAnnouncementBody} placeholder="Message to all users" placeholderTextColor={colors.textFaint} style={[styles.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={500} />
              <PressableScale disabled={saving || !announcementTitle.trim() || !announcementBody.trim()} onPress={() => { void publishAnnouncement(); }} label="Publish in-app announcement" style={[styles.button, (saving || !announcementTitle.trim() || !announcementBody.trim()) && { opacity: 0.5 }]}>
                <Ionicons name="megaphone-outline" size={16} color={colors.onAccent} /><Text style={styles.buttonText}>Publish announcement</Text>
              </PressableScale>
            </View>

            <View style={styles.noticeBox}><Text style={styles.body}>Subscriptions are not available yet and are coming soon. Premium access can be granted per account from Users, but it is not a payment record; checkout, subscription status and revenue are not yet connected.</Text></View>
          </>
        ) : null}

        {section === 'health' && summary ? (
          <>
            <View style={styles.card}>
              <View style={styles.spread}><Text style={styles.sectionTitle}>Backend health</Text><View style={[styles.badge, summary.health.database ? null : styles.badgeDanger]}><Text style={[styles.badgeText, summary.health.database ? null : styles.badgeDangerText]}>{summary.health.database ? 'Database reachable' : 'Unavailable'}</Text></View></View>
              <Text style={styles.sectionHint}>Health indicates that the secured admin function and database summary query completed successfully. Provider uptime is not inferred from this check.</Text>
              <Text style={styles.small}>Checked {formatDateTime(summary.health.checkedAt)}</Text>
            </View>
            <View style={styles.grid}>
              {metric('AI calls · 7 days', summary.aiRequests7d, 'pulse-outline')}
              {metric('AI calls · 30 days', summary.aiRequests30d, 'stats-chart-outline')}
              {metric('Failures · 24 hours', summary.aiFailures24h, 'alert-circle-outline')}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>AI model usage · 30 days</Text>
              {summary.modelUsage.length ? summary.modelUsage.map((item) => (
                <View key={`${item.provider}:${item.model}`} style={[styles.quotaRow, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1 }}><Text style={styles.body}>{item.provider} · {item.model}</Text><Text style={styles.small}>{number(item.succeeded)} successful · {number(item.failed)} failed</Text></View>
                  <Text style={styles.userName}>{number(item.calls)}</Text>
                </View>
              )) : <Text style={styles.small}>No model-call telemetry recorded yet.</Text>}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Error monitor · 7 days</Text>
              <Text style={styles.sectionHint}>Generic error codes and counts only; raw provider messages, prompts, and user conversations are not stored here.</Text>
              {summary.recentErrors.length ? summary.recentErrors.map((item, i) => (
                <View key={`${item.code ?? 'unknown'}-${i}`} style={styles.quotaRow}><Text style={[styles.body, { flex: 1 }]}>{item.code ?? 'Unknown error'}</Text><Text style={styles.userName}>{number(item.occurrences)}</Text><Text style={styles.small}>{formatDateTime(item.lastSeen)}</Text></View>
              )) : <Text style={styles.small}>No failed AI provider calls recorded in this period.</Text>}
            </View>
            <View style={styles.card}>
              <View style={styles.spread}><Text style={styles.sectionTitle}>Recent admin audit</Text>{auditLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}</View>
              {auditEntries.length ? auditEntries.slice(0, 30).map((entry) => (
                <View key={entry.id} style={styles.quotaRow}>
                  <View style={{ flex: 1 }}><Text style={styles.body}>{entry.action.replace(/_/g, ' ')}</Text><Text style={styles.small}>{formatDateTime(entry.created_at)} · actor {entry.actor_id?.slice(0, 8) ?? 'system'}</Text></View>
                  {entry.target_user_id ? <Text style={styles.mono}>{entry.target_user_id.slice(0, 8)}</Text> : null}
                </View>
              )) : <Text style={styles.small}>No administrative actions recorded yet.</Text>}
            </View>
          </>
        ) : null}

        {section === 'admins' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Authorized administrators</Text>
              <Text style={styles.sectionHint}>The founder identity is pinned in server-side Supabase Function Secrets. Only the founder can grant or revoke other admin access.</Text>
              {founderEntry ? (
                <View style={styles.userCard}>
                  <View style={styles.spread}><Text style={styles.userName}>Founder</Text><View style={styles.badge}><Text style={styles.badgeText}>permanent</Text></View></View>
                  <Text style={styles.userEmail}>{founderEntry.email}</Text>
                  <Text style={styles.mono}>{founderEntry.userId}</Text>
                </View>
              ) : <View style={styles.errorBox}><Text style={[styles.body, { color: colors.danger }]}>Founder identity is not configured or could not be resolved. Access remains fail-closed.</Text></View>}
              {admins.map((item) => (
                <View key={item.userId} style={styles.userCard}>
                  <View style={styles.spread}><Text style={styles.userName}>{item.displayName || 'Administrator'}</Text><View style={[styles.badge, !item.enabled && styles.badgeDanger]}><Text style={[styles.badgeText, !item.enabled && styles.badgeDangerText]}>{item.enabled ? 'active' : 'disabled'}</Text></View></View>
                  <Text style={styles.userEmail}>{item.email}</Text>
                  <Text style={styles.mono}>{item.userId}</Text>
                  {canManageAdmins ? <PressableScale onPress={() => confirmAdminRemoval(item)} label="Remove admin access" style={[styles.secondaryButton, styles.dangerButton, { alignSelf: 'flex-start' }]}><Ionicons name="person-remove-outline" size={14} color={colors.danger} /><Text style={styles.dangerText}>Revoke access</Text></PressableScale> : null}
                </View>
              ))}
              {canManageAdmins ? (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.body}>Grant access to an existing Turzam account</Text>
                  <TextInput value={adminEmail} onChangeText={setAdminEmail} placeholder="Verified account email" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
                  <PressableScale disabled={saving || !adminEmail.includes('@')} onPress={() => { void setAdmin(adminEmail.trim(), true); }} label="Grant administrator access" style={[styles.button, (saving || !adminEmail.includes('@')) && { opacity: 0.5 }]}><Ionicons name="shield-checkmark-outline" size={16} color={colors.onAccent} /><Text style={styles.buttonText}>Grant admin access</Text></PressableScale>
                </>
              ) : <Text style={styles.small}>Administrator changes are restricted to the founder account.</Text>}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Administrative audit log</Text>
              {auditEntries.length ? auditEntries.slice(0, 50).map((entry) => (
                <View key={entry.id} style={styles.quotaRow}>
                  <View style={{ flex: 1 }}><Text style={styles.body}>{entry.action.replace(/_/g, ' ')}</Text><Text style={styles.small}>{formatDateTime(entry.created_at)}</Text></View>
                  {entry.target_user_id ? <Text style={styles.mono}>{entry.target_user_id.slice(0, 8)}</Text> : null}
                </View>
              )) : <Text style={styles.small}>{auditLoading ? 'Loading audit history…' : 'No actions recorded.'}</Text>}
            </View>
          </>
        ) : null}

        {!summary && !loading && error ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Admin data unavailable</Text>
            <Text style={styles.sectionHint}>The panel is fail-closed. Verify that the Supabase schema and founder-admin Edge Function are deployed, and that the server-side founder identity and access-code secrets are configured.</Text>
            <PressableScale onPress={() => { void loadDashboard(); }} label="Retry admin data" style={styles.button}><Ionicons name="refresh-outline" size={16} color={colors.onAccent} /><Text style={styles.buttonText}>Retry</Text></PressableScale>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
