export type ModeId = 'founder' | 'balanced' | 'think' | 'create' | 'code' | 'tutor';
export type PersonaId = 'none' | 'professional' | 'analyst' | 'creative' | 'teacher' | 'entrepreneur';
export type ProviderId = 'gemini' | 'openai' | 'anthropic';
export type ModelChoice = 'auto' | ProviderId;

export type Conversation = {
  id: string;
  title: string;
  mode: ModeId;
  model?: ModelChoice;
  persona?: PersonaId;
  pinned?: boolean;
  archived?: boolean;
  folder_id?: string | null;
  project_id?: string | null;
  updated_at: string;
};

export type Folder = { id: string; name: string; color: string };

export type Source = { title: string; url: string };

/** A file attached to a message (image, PDF or text file). */
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Storage path in the private "attachments" bucket (set once uploaded). */
  path?: string | null;
  /** Local file uri (just picked) or a signed URL (loaded from history). Only used for display. */
  uri?: string;
};

/** A file the user picked but has not sent yet. */
export type PickedFile = {
  uri: string;
  name: string;
  mime: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachments?: Attachment[];
  provider?: ProviderId | null;
  sources?: Source[];
  searched?: boolean;
  streaming?: boolean;
  /** Shown in the thinking indicator while files are uploaded / read. */
  working?: string;
  error?: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  memory_enabled: boolean;
  default_mode: ModeId;
  default_model?: ModelChoice;
  default_persona?: PersonaId;
  custom_instructions?: string;
  voice_reply?: boolean;
  voice_lang?: string;
};

export type Memory = {
  id: string;
  content: string;
  pinned?: boolean;
  created_at: string;
};

export type Capabilities = { search: boolean; voiceInput: boolean };

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  vendor: string;
  model: string;
  available: boolean;
};
