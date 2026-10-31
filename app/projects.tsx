import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { createProject, listProjects, type Project } from '../src/lib/projects';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const project = await createProject(clean);
      setProjects((current) => [project, ...current]);
      setName('');
      setCreating(false);
      router.push({ pathname: '/project', params: { id: project.id } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create this project.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader
        title="Projects"
        right={(
          <PressableScale onPress={() => setCreating(true)} style={[styles.addButton, { backgroundColor: colors.accent }]} label="Create project">
            <Ionicons name="add" size={21} color={colors.onAccent} />
          </PressableScale>
        )}
      />
      <View style={styles.intro}>
        <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.introMark}>
          <Ionicons name="layers-outline" size={23} color={colors.onAccent} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.introTitle}>A focused space for every big idea.</Text>
          <Text style={styles.introText}>Give each project its own chats, reference files, and working instructions.</Text>
        </View>
      </View>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={refresh}
        ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : (
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={32} color={colors.accentInk} />
            <Text style={styles.emptyTitle}>{error ? 'Projects aren’t available yet' : 'Start with one clear goal'}</Text>
            <Text style={styles.emptyText}>{error || 'Create a workspace for a launch, a client, a course, or anything you want Turzam to keep in context.'}</Text>
            {!error ? <PressableScale onPress={() => setCreating(true)} style={[styles.emptyAction, { backgroundColor: colors.accent }]} label="Create your first project"><Text style={[styles.emptyActionText, { color: colors.onAccent }]}>Create a project</Text></PressableScale> : null}
          </View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}>
            <PressableScale onPress={() => router.push({ pathname: '/project', params: { id: item.id } })} style={styles.projectCard} scaleTo={0.985} label={`Open project ${item.name}`}>
              <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.projectMark}>
                <Ionicons name="folder-open" size={19} color={colors.onAccent} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.projectName}>{item.name}</Text>
                <Text style={styles.projectMeta}>Workspace · {item.instructions.trim() ? 'Instructions set' : 'Ready to shape'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </PressableScale>
          </Animated.View>
        )}
      />
      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New project</Text>
            <Text style={styles.modalHint}>Name a workspace for the work you want to move forward.</Text>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              onSubmitEditing={create}
              returnKeyType="done"
              maxLength={60}
              placeholder="e.g. Spring product launch"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <PressableScale onPress={() => { setCreating(false); setName(''); }} style={styles.cancelButton} label="Cancel project creation"><Text style={styles.cancelText}>Cancel</Text></PressableScale>
              <PressableScale disabled={!name.trim() || saving} onPress={create} style={[styles.createButton, { backgroundColor: colors.accent, opacity: !name.trim() || saving ? 0.55 : 1 }]} label="Create project">
                {saving ? <ActivityIndicator color={colors.onAccent} /> : <><Text style={[styles.createText, { color: colors.onAccent }]}>Create</Text><Ionicons name="arrow-forward" size={16} color={colors.onAccent} /></>}
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const make = (t: Theme) => StyleSheet.create({
  addButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 4, marginBottom: 16, padding: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: t.colors.border, backgroundColor: withAlpha(t.colors.surface, 0.86) },
  introMark: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  introText: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19, marginTop: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 10, flexGrow: 1 },
  projectCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: withAlpha(t.colors.surface, 0.94), borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border },
  projectMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  projectName: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  projectMeta: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12, marginTop: 3 },
  loading: { paddingVertical: 38 },
  empty: { flex: 1, minHeight: 280, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 10 },
  emptyTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 19, textAlign: 'center' },
  emptyText: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyAction: { marginTop: 8, paddingHorizontal: 18, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { fontFamily: fonts.uiBold, fontSize: 14 },
  modalBackdrop: { flex: 1, padding: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.overlay },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: t.colors.surface, borderColor: t.colors.borderStrong, borderWidth: 1, borderRadius: radius.xl, padding: 22, gap: 11 },
  modalTitle: { color: t.colors.text, fontFamily: fonts.display, fontSize: 28 },
  modalHint: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
  input: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 15, minHeight: 48, backgroundColor: t.colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: t.colors.border, paddingHorizontal: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 6 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 14 },
  cancelText: { color: t.colors.textDim, fontFamily: fonts.ui, fontSize: 14 },
  createButton: { minWidth: 112, height: 42, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createText: { fontFamily: fonts.uiBold, fontSize: 14 },
});
