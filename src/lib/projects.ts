import { supabase } from './supabase';
import { fileKind } from './attachments';
import { uuid } from './utils';
import type { PickedFile } from '../types';

export type Project = {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  created_at: string;
};

export const MAX_PROJECT_FILES = 6;
export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;
const BUCKET = 'attachments';

function safeName(name: string): string {
  return (name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'file').slice(-80);
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id,name,instructions,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id,name,instructions,created_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Project | null) ?? null;
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase
    .from('project_files')
    .select('id,project_id,name,mime,size,path,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectFile[];
}

export async function createProject(name: string): Promise<Project> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error('Give your project a name first.');
  const { data, error } = await supabase
    .from('projects')
    .insert({ name: clean })
    .select('id,name,instructions,created_at,updated_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create this project.');
  return data as Project;
}

export async function updateProject(id: string, patch: { name?: string; instructions?: string }): Promise<void> {
  const next: Record<string, string> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 60);
    if (!clean) throw new Error('Give your project a name first.');
    next.name = clean;
  }
  if (patch.instructions !== undefined) next.instructions = patch.instructions.trim().slice(0, 2000);
  next.updated_at = new Date().toISOString();
  const { error } = await supabase.from('projects').update(next).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadProjectFile(userId: string, projectId: string, file: PickedFile): Promise<ProjectFile> {
  if (!fileKind(file.mime, file.name)) throw new Error(`“${file.name}” is not a supported project file.`);
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error(`“${file.name}” is larger than 10 MB.`);
  const response = await fetch(file.uri);
  if (!response.ok) throw new Error(`Could not read “${file.name}”.`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_PROJECT_FILE_BYTES) throw new Error(`“${file.name}” is larger than 10 MB.`);

  const path = `${userId}/projects/${projectId}/${uuid()}-${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.mime,
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not upload “${file.name}”: ${uploadError.message}`);

  const { data, error } = await supabase
    .from('project_files')
    .insert({ project_id: projectId, name: file.name, mime: file.mime, size: bytes.byteLength, path })
    .select('id,project_id,name,mime,size,path,created_at')
    .single();
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw new Error(error?.message ?? 'Could not save this project file.');
  }
  return data as ProjectFile;
}

export async function deleteProjectFile(file: ProjectFile): Promise<void> {
  // Remove the stored file first: if this fails the row stays, so the user can simply retry.
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.path]);
  if (storageError) throw new Error(`Could not remove the file. Please try again: ${storageError.message}`);
  const { error } = await supabase.from('project_files').delete().eq('id', file.id);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const files = await listProjectFiles(id);
  if (files.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(files.map((file) => file.path));
    if (storageError) throw new Error(`Could not remove the project's files. Please try again: ${storageError.message}`);
  }
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
