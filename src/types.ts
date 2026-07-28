export interface Track {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  key_signature: string;
  duration: number;
  tags: string[];
  status: 'ready' | 'processing' | 'error';
  size: number;
  type: string;
  file_url: string | null;
  file_data?: Blob;
  _brokenBlob?: boolean;
  image_url?: string | null;
  image_data?: Blob;
  plays: number;
  likes: number;
  created_at: string;
  lyrics?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  track_ids: string[];
  start_color: string;
  end_color: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  status: 'online' | 'offline' | 'away';
  last_active: string;
  tags: string[];
  company?: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  track_id?: string;
  playlist_id?: string;
  client_id?: string;
  recipient_email?: string;
  download_enabled: boolean;
  access_count: number;
  expires_at?: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  type: 'play' | 'download' | 'share' | 'social' | 'system' | 'message' | 'upload';
  user: string;
  action: string;
  target?: string;
  details?: string;
  timestamp: string;
  client_id?: string;
  track_id?: string;
  playlist_id?: string;
}

export interface Message {
  id: string;
  client_id: string;
  recipient_id: string;
  content: string;
  image_url?: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  is_read: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  artist_name: string;
  email: string;
  avatar_url: string;
  bio: string;
  social_links?: {
    instagram?: string;
    spotify?: string;
    twitter?: string;
  };
}

export interface PromoVideo {
  id: string;
  track_id?: string;
  playlist_id?: string;
  video_url: string;
  video_data?: Blob;
  thumbnail_url: string;
  thumbnail_data?: Blob;
  style: string;
  status: 'processing' | 'ready' | 'error';
  _brokenBlob?: boolean;
  created_at: string;
  name?: string;
  title?: string;
}
