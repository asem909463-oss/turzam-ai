import { supabase } from './supabase';
import { purgeAllUserFiles } from './attachments';

/**
 * Deletes every chat of the signed-in user, and every uploaded file (also files whose chat is already gone).
 * Files go first: if they cannot be removed, the chats stay and the user can simply try again.
 */
export async function deleteAllChats(userId: string): Promise<void> {
  await purgeAllUserFiles(userId);
  // Deleting a chat removes its messages too (on delete cascade); no row limit, one statement.
  const { error } = await supabase.from('conversations').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
  // Folders are organisation only; remove them as well so "delete all chats" really starts fresh.
  await supabase.from('folders').delete().eq('user_id', userId);
}
