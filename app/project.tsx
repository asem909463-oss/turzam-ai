import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Aurora } from '../src/components/Aurora';
import { PressableScale } from '../src/components/PressableScale';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useAuth } from '../src/context/AuthContext';
import { useStyles, useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { formatSize, pickDocuments } from '../src/lib/attachments';
import { deleteProject, deleteProjectFile, getProject, listProjectFiles, MAX_PROJECT_FILES, ProjectFile, Project, updateProject, uploadProjectFile } from '../src/lib/projects';
import { supabase } from '../src/lib/supabase';
import { fonts, radius, Theme, withAlpha } from '../src/theme';

type ProjectChat = { id: string; title: string; updated_at: string };

export default function ProjectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const projectId = typeof id === 'string' ? id : '';
  const { user } = useAuth();
  const { colors, gradient } = useTheme();
  const styles = useStyles(make);
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [nextProject, nextFiles, chatRes] = await Promise.all([
        getProject(projectId),
        listProjectFiles(projectId),
        supabase.from('conversations').select('id,title,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),
      ]);
      if (!nextProject) {
        setProject(null);
        toast.show('This project could not be found.', 'error');
        router.replace('/projects');
        return;
      }
      if (chatRes.error) throw new Error(chatRes.error.message);
      setProject(nextProject);
      setName(nextProject.name);
      setInstructions(nextProject.instructions ?? '');
      setFiles(nextFiles);
      setChats((chatRes.data ?? []) as ProjectChat[]);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not load this project.', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, router, toast]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function save() {
    if (!project) return;
    setSaving(true);
    try {
      await updateProject(project.id, { name, instructions });
      setProject({ ...project, name: name.trim(), instructions: instructions.trim() });
      toast.show('Project workspace saved', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save this project.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function addFiles() {
    if (!user || !project) return;
    if (files.length >= MAX_PROJECT_FILES) {
      toast.show(`A project can hold up to ${MAX_PROJECT_FILES} reference files.`, 'info');
      return;
    }
    const picked = await pickDocuments();
    if (picked.error) {
      toast.show(picked.error, 'error');
      return;
    }
    if (!picked.files.length) return;
    const room = MAX_PROJECT_FILES - files.length;
    const batch = picked.files.slice(0, room);
    setUploading(true);
    try {
      const uploaded: ProjectFile[] = [];
      for (const file of batch) uploaded.push(await uploadProjectFile(user.id, project.id, file));
      setFiles((current) => [...uploaded, ...current]);
      toast.show(`${uploaded.length} project file${uploaded.length === 1 ? '' : 's'} added`, 'success');
      if (picked.files.length > room) toast.show(`Only ${room} file${room === 1 ? '' : 's'} fit in this project.`, 'info');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not add that file.', 'error');
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  function removeFile(file: ProjectFile) {
    Alert.alert('Remove reference file?', `“${file.name}” will be removed from this project.`, [
      { text: 'Keep file', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteProjectFile(file);
          setFiles((current) => current.filter((item) => item.id !== file.id));
          toast.show('Project file removed', 'success');
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Could not remove this file.', 'error');
          await refresh();
        }
      } },
    ]);
  }

  function removeWorkspace() {
    if (!project) return;
    Alert.alert('Delete this project?', 'Its reference files and instructions will be removed. Project chats are kept in your history and detached from the workspace.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete project', style: 'destructive', onPress: async () => {
        try {
          await deleteProject(project.id);
          toast.show('Project deleted. Its chats are still in history.', 'success');
          router.replace('/projects');
        } catch (e) {
          toast.show(e instanceof Error ? e.message : 'Could not delete this project.', 'error');
        }
      } },
    ]);
  }

  if (loading && !project) {
    return <View style={{ flex: 1 }}><Aurora /><ScreenHeader title="Project" /><View style={styles.loading}><ActivityIndicator color={colors.accent} /></View></View>;
  }

  if (!project) {
    return <View style={{ flex: 1 }}><Aurora /><ScreenHeader title="Project" /><View style={styles.empty}><Text style={styles.emptyTitle}>Project unavailable</Text><PressableScale onPress={() => router.replace('/projects')} style={styles.secondaryButton} label="Back to projects"><Text style={styles.secondaryText}>Back to projects</Text></PressableScale></View></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScreenHeader title="Workspace" right={(
        <PressableScale onPress={removeWorkspace} style={styles.deleteButton} label="Delete project"><Ionicons name="trash-outline" size={19} color={colors.danger} /></PressableScale>
      )} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.hero}>
          <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroIcon}><Ionicons name="folder-open" size={23} color={colors.onAccent} /></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PROJECT WORKSPACE</Text>
            <Text numberOfLines={2} style={styles.heroName}>{project.name}</Text>
          </View>
        </Animated.View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIcon}><Ionicons name="compass-outline" size={17} color={colors.accentInk} /></View>
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Project instructions</Text><Text style={styles.sectionHint}>These guide every chat in this workspace.</Text></View>
          </View>
          <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Project name" placeholderTextColor={colors.textFaint} selectionColor={colors.accent} style={styles.nameInput} />
          <TextInput
            value={instructions}
            onChangeText={setInstructions}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            placeholder="What is this project about? What should Turzam know or prioritize?"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            style={styles.instructions}
          />
          <View style={styles.saveRow}>
            <Text style={styles.counter}>{instructions.length}/2000</Text>
            <PressableScale disabled={saving || !name.trim()} onPress={save} style={[styles.saveButton, { backgroundColor: colors.accent, opacity: saving || !name.trim() ? 0.55 : 1 }]} label="Save project settings">
              {saving ? <ActivityIndicator color={colors.onAccent} /> : <><Text style={[styles.saveText, { color: colors.onAccent }]}>Save workspace</Text><Ionicons name="checkmark" size={16} color={colors.onAccent} /></>}
            </PressableScale>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIcon}><Ionicons name="documents-outline" size={17} color={colors.accentInk} /></View>
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Reference files</Text><Text style={styles.sectionHint}>Up to {MAX_PROJECT_FILES} private files · images, PDFs, and text · 10 MB each</Text></View>
            <PressableScale disabled={uploading || files.length >= MAX_PROJECT_FILES} onPress={addFiles} style={[styles.uploadButton, { borderColor: withAlpha(colors.accent, 0.5), opacity: uploading || files.length >= MAX_PROJECT_FILES ? 0.45 : 1 }]} label="Add project reference files">
              {uploading ? <ActivityIndicator color={colors.accentInk} size="small" /> : <Ionicons name="add" size={20} color={colors.accentInk} />}
            </PressableScale>
          </View>
          {files.length ? files.map((file) => (
            <View key={file.id} style={styles.fileRow}>
              <View style={styles.fileIcon}><Ionicons name={file.mime.startsWith('image/') ? 'image-outline' : file.mime === 'application/pdf' ? 'document-text-outline' : 'code-slash-outline'} size={17} color={colors.accentInk} /></View>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.fileName}>{file.name}</Text><Text style={styles.fileSize}>{formatSize(file.size)}</Text></View>
              <PressableScale onPress={() => removeFile(file)} label={`Remove ${file.name}`} style={styles.removeFile}><Ionicons name="close" size={17} color={colors.textFaint} /></PressableScale>
            </View>
          )) : <Text style={styles.noFiles}>No reference files yet. Add a brief, research PDF, product notes, or another source Turzam should use.</Text>}
        </View>

        <View style={styles.chatsHeader}>
          <View><Text style={styles.sectionTitle}>Project chats</Text><Text style={styles.sectionHint}>{chats.length} conversation{chats.length === 1 ? '' : 's'} · kept in your normal history too</Text></View>
          <PressableScale onPress={() => router.push({ pathname: '/', params: { projectId: project.id } })} style={[styles.newChatButton, { backgroundColor: colors.accent }]} label="Start a chat in this project"><Ionicons name="add" size={18} color={colors.onAccent} /><Text style={[styles.newChatText, { color: colors.onAccent }]}>New chat</Text></PressableScale>
        </View>
        {chats.length ? chats.map((chat, index) => (
          <Animated.View key={chat.id} entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(220)}>
            <PressableScale onPress={() => router.push({ pathname: '/', params: { conversationId: chat.id } })} style={styles.chatRow} label={`Open chat ${chat.title}`}>
              <View style={styles.chatIcon}><Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.accentInk} /></View>
              <Text numberOfLines={1} style={styles.chatTitle}>{chat.title}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </PressableScale>
          </Animated.View>
        )) : <View style={styles.noChats}><Text style={styles.noFiles}>This workspace is ready. Start a project chat to build context around your work.</Text></View>}
      </ScrollView>
    </View>
  );
}

const make = (t: Theme) => StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 34, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 18 },
  deleteButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  hero: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 15, padding: 18, borderRadius: radius.xl, backgroundColor: withAlpha(t.colors.surface, 0.88), borderWidth: 1, borderColor: t.colors.border },
  heroIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: t.colors.accentInk, fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1.2 },
  heroName: { color: t.colors.text, fontFamily: fonts.display, fontSize: 27, marginTop: 2 },
  sectionCard: { padding: 16, borderRadius: radius.xl, backgroundColor: withAlpha(t.colors.surface, 0.94), borderWidth: 1, borderColor: t.colors.border, gap: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: withAlpha(t.colors.accent, 0.14), alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: t.colors.text, fontFamily: fonts.uiBold, fontSize: 16 },
  sectionHint: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  nameInput: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, color: t.colors.text, fontFamily: fonts.ui, fontSize: 15, backgroundColor: t.colors.bgElevated, borderWidth: 1, borderColor: t.colors.border },
  instructions: { minHeight: 112, paddingHorizontal: 12, paddingVertical: 11, borderRadius: radius.md, color: t.colors.text, fontFamily: fonts.uiRegular, fontSize: 14, lineHeight: 20, backgroundColor: t.colors.bgElevated, borderWidth: 1, borderColor: t.colors.border },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  counter: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 12 },
  saveButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveText: { fontFamily: fonts.uiBold, fontSize: 13 },
  uploadButton: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.colors.border },
  fileIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: withAlpha(t.colors.accent, 0.12), alignItems: 'center', justifyContent: 'center' },
  fileName: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 13 },
  fileSize: { color: t.colors.textFaint, fontFamily: fonts.uiRegular, fontSize: 11, marginTop: 2 },
  removeFile: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  noFiles: { color: t.colors.textDim, fontFamily: fonts.uiRegular, fontSize: 13, lineHeight: 19 },
  chatsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, marginTop: 4 },
  newChatButton: { height: 38, paddingHorizontal: 12, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  newChatText: { fontFamily: fonts.uiBold, fontSize: 12 },
  chatRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.surface, 0.9), borderWidth: 1, borderColor: t.colors.border },
  chatIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: withAlpha(t.colors.accent, 0.12), alignItems: 'center', justifyContent: 'center' },
  chatTitle: { flex: 1, color: t.colors.text, fontFamily: fonts.ui, fontSize: 14 },
  noChats: { padding: 14, borderRadius: radius.md, backgroundColor: withAlpha(t.colors.surface, 0.8), borderWidth: 1, borderColor: t.colors.border },
  secondaryButton: { padding: 12, borderRadius: radius.md, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  secondaryText: { color: t.colors.text, fontFamily: fonts.ui, fontSize: 14 },
});
