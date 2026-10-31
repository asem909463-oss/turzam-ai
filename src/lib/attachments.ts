import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';
import { uuid } from './utils';
import type { Attachment, PickedFile } from '../types';

export const BUCKET = 'attachments';
export const MAX_FILES = 4;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

type IconName = ComponentProps<typeof Ionicons>['name'];

const TEXT_EXT = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py',
  'java', 'c', 'h', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'ps1', 'yml', 'yaml',
  'toml', 'ini', 'log', 'env', 'srt', 'vtt',
];

export type FileKind = 'image' | 'pdf' | 'text';

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function guessMime(name: string, given?: string | null): string {
  if (given && given !== 'application/octet-stream') return given;
  const e = ext(name);
  if (e === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg'].includes(e)) return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  if (e === 'heic' || e === 'heif') return 'image/heic';
  if (e === 'json') return 'application/json';
  if (e === 'csv') return 'text/csv';
  if (e === 'md' || e === 'markdown') return 'text/markdown';
  if (TEXT_EXT.includes(e)) return 'text/plain';
  return given || 'application/octet-stream';
}

export function fileKind(mime: string, name: string): FileKind | null {
  const m = mime.toLowerCase();
  const e = ext(name);
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || e === 'pdf') return 'pdf';
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || TEXT_EXT.includes(e)) return 'text';
  return null;
}

export function kindIcon(kind: FileKind | null): IconName {
  if (kind === 'image') return 'image-outline';
  if (kind === 'pdf') return 'document-text-outline';
  if (kind === 'text') return 'code-slash-outline';
  return 'document-outline';
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const SUPPORTED_HINT = 'Turzam can read images, PDFs and text files (txt, md, csv, json, code).';

/** Checks a picked file against the rules. Returns an error message, or null when it is fine. */
export function validateFile(f: PickedFile, existing: PickedFile[]): string | null {
  if (existing.length >= MAX_FILES) return `You can attach up to ${MAX_FILES} files per message.`;
  if (!fileKind(f.mime, f.name)) return `"${f.name}" is not supported. ${SUPPORTED_HINT}`;
  if (f.size > MAX_FILE_BYTES) return `"${f.name}" is larger than ${formatSize(MAX_FILE_BYTES)}.`;
  const total = existing.reduce((s, x) => s + x.size, 0) + f.size;
  if (total > MAX_TOTAL_BYTES) return `Attachments are over ${formatSize(MAX_TOTAL_BYTES)} in total.`;
  return null;
}

const IMAGE_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  allowsEditing: false,
  allowsMultipleSelection: true,
  selectionLimit: MAX_FILES,
};

function fromImageResult(res: ImagePicker.ImagePickerResult): PickedFile[] {
  if (res.canceled) return [];
  return res.assets.map((a, i) => {
    const mime = guessMime(a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg');
    const name = a.fileName ?? `photo-${Date.now()}-${i}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    return { uri: a.uri, name, mime, size: a.fileSize ?? 0 };
  });
}

/** Returns { files } or { error } (permission problems and similar). */
export async function pickPhotoFromLibrary(): Promise<{ files: PickedFile[]; error?: string }> {
  try {
    return { files: fromImageResult(await ImagePicker.launchImageLibraryAsync(IMAGE_OPTS)) };
  } catch {
    return { files: [], error: 'Could not open your photo library.' };
  }
}

export async function takePhoto(): Promise<{ files: PickedFile[]; error?: string }> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { files: [], error: 'Camera access is off. Allow it for Turzam AI in your phone settings.' };
    return { files: fromImageResult(await ImagePicker.launchCameraAsync(IMAGE_OPTS)) };
  } catch {
    return { files: [], error: 'Could not open the camera.' };
  }
}

export async function pickDocuments(): Promise<{ files: PickedFile[]; error?: string }> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return { files: [] };
    return {
      files: res.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mime: guessMime(a.name, a.mimeType),
        size: a.size ?? 0,
      })),
    };
  } catch {
    return { files: [], error: 'Could not open your files.' };
  }
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned || 'file').slice(-80);
}

/** Uploads one picked file into the user's private folder and returns its attachment record. */
export async function uploadAttachment(userId: string, convId: string, f: PickedFile): Promise<Attachment> {
  const res = await fetch(f.uri);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error(`"${f.name}" is too large.`);
  const path = `${userId}/${convId}/${uuid()}-${safeName(f.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: f.mime, upsert: false });
  if (error) throw new Error(`Could not upload "${f.name}": ${error.message}`);
  return { id: uuid(), name: f.name, mime: f.mime, size: buf.byteLength, path, uri: f.uri };
}

/** Removes only the supplied paths; useful when a multi-file send fails part-way through. */
export async function purgeAttachmentPaths(paths: string[]): Promise<void> {
  const safePaths = paths.filter((path) => typeof path === 'string' && path.length > 0 && !path.includes('..'));
  if (!safePaths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(safePaths);
  if (error) throw new Error(`Could not clean up uploaded files: ${error.message}`);
}

/** Removes every uploaded file of a conversation (best effort). */
export async function purgeConversationFiles(userId: string, convId: string): Promise<void> {
  try {
    const folder = `${userId}/${convId}`;
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
      if (error || !data?.length) break;
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(data.map((o) => `${folder}/${o.name}`));
      if (removeError) break;
      if (data.length < 100) break;
    }
  } catch {
    // ignore: the database rows are what matters
  }
}
