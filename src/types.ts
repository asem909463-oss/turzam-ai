export type ModeId = 'founder' | 'balanced' | 'think' | 'create' | 'code' | 'tutor';
export type ProviderId = 'gemini' | 'openai' | 'anthropic';
export type ModelChoice = 'auto' | ProviderId;

export type Conversation = {
  id: string;
  title: string;
  mode: ModeId;
  model?: ModelChoice;
  updated_at: string;
};

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
};

export type Memory = {
  id: string;
  content: string;
  created_at: string;
};

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  vendor: string;
  model: string;
  available: boolean;
};
