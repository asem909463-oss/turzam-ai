export type ModeId = 'balanced' | 'think' | 'create' | 'code' | 'tutor';

export type Conversation = {
  id: string;
  title: string;
  mode: ModeId;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  imageUri?: string; // local or signed URL used for display
  imagePath?: string | null; // storage path (saved in DB)
  imageB64?: string; // only kept for images sent in this session
  imageMime?: string;
  streaming?: boolean;
  error?: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  memory_enabled: boolean;
  default_mode: ModeId;
};

export type PickedImage = {
  uri: string;
  base64: string;
  mime: string;
};

export type Memory = {
  id: string;
  content: string;
  created_at: string;
};
