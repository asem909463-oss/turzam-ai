import { supabase } from './supabase';
import { purgeConversationFiles } from './attachments';

/** Deletes every chat (and its uploaded files) of the signed-in user. */
export async function deleteAllChats(userId: string): Promise<void> {
  const { data } = await supabase.from('conversations').select('id').limit(1000);
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map((id) => purgeConversationFiles(userId, id)));
  }
  const { error } = await supabase.from('conversations').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}
