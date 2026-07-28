# OG BEATZ — Supabase Development Integration Guide

A dedicated hand-book for the development team on how to correctly and safely read/write from **OG BEATZ**'s live Supabase instance using our existing client setup.

---

## 1. Import & Client Initialization (Strict Rules)

The Supabase client is already robustly and cleanly configured in the codebase. **Do NOT** instantiate a new client manually or modify the existing config.

Import the getter from our lib directory:
```typescript
import { getSupabaseClient } from '@/src/lib/supabase';
```

### Async Requirement & Safety Guard
Because `getSupabaseClient()` is an asynchronous function that may return `null` if the environment variables are offline or unconfigured, you must always await the initializer and guard against the null case. 

We highly recommend using a custom wrapper utility to safely scope your DB operations:

```typescript
import { getSupabaseClient } from '@/src/lib/supabase';

/**
 * Executes a callback with a safely confirmed Supabase client.
 * Auto-guards against null client instances during connection downtime.
 */
export async function withSupabase<T>(
  fn: (supabase: any) => Promise<T>
): Promise<T | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client is offline or unconfigured.');
    return null;
  }
  return fn(supabase);
}
```

### Usage Pattern
```typescript
const result = await withSupabase(async (supabase) => {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .limit(10);
    
  if (error) throw error;
  return data;
});
```

---

## 2. General Integration Principles

* ❌ **DO NOT** edit tables, columns, foreign keys, triggers, or policies.
* ❌ **DO NOT** run `ALTER TABLE`, `DROP`, or write database schema migrations.
* ❌ **DO NOT** use the Supabase Service Role Key on the client side. Only use the client-safe anonymizer key (`VITE_SUPABASE_ANON_KEY`).
* Only use client-safe SELECT, INSERT, and UPDATE CRUD operations.

---

## 3. Core Technical Data Flows

Below are the 4 main integration scenarios with their matching minimal code patterns.

### A) Share Link Resolution: `share_links` ➔ Tracks or Playlists
Given a token query parameter parsed from the client URL page:

```typescript
const resolveShareLink = await withSupabase(async (supabase) => {
  // 1. Fetch link metadata by unique cryptographic token
  const { data: link, error: linkError } = await supabase
    .from('share_links')
    .select('*')
    .eq('token', targetToken)
    .single();

  if (linkError || !link) {
    throw new Error('Invalid or non-existent share link token.');
  }

  // 2. Resolve link structure (Either a Single Track OR a full Playlist)
  if (link.track_id) {
    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', link.track_id)
      .single();
      
    return { type: 'track', data: track };
  } else if (link.playlist_id) {
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', link.playlist_id)
      .single();
      
    if (playlist?.track_ids?.length) {
      const { data: tracks, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .in('id', playlist.track_ids);
        
      return { type: 'playlist', metadata: playlist, tracks };
    }
    return { type: 'playlist', metadata: playlist, tracks: [] };
  }
});
```

### B) Dashboard CRUD: Inserting / Registering a Track Metadata Row
For inserting newly processed beats or mix files directly into the catalog:

```typescript
const registerTrack = async (trackData: { name: string; fileUrl: string; duration: number; size: number }) => {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from('tracks')
      .insert({
        id: crypto.randomUUID(),
        name: trackData.name,
        artist: 'OGBeatz',
        bpm: 130,
        key_signature: 'G Minor',
        file_url: trackData.fileUrl,
        duration: trackData.duration,
        size: trackData.size,
        type: 'audio/mpeg',
        status: 'ready',
      });
      
    if (error) console.error('Error registering track metadata:', error);
    return { data, error };
  });
};
```

### C) Review Messaging Chat: Submitting Messages
To send inline track reviews and communication between clients/producers:

```typescript
const sendReviewMessage = async (activeClientId: string, content: string) => {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        id: crypto.randomUUID(),
        client_id: activeClientId,
        content: content,
        direction: 'inbound', // 'inbound' for client reviews, 'outbound' for producers
        timestamp: new Date().toISOString(),
      });
      
    if (error) console.error('Error inserting client message:', error);
    return { data, error };
  });
};
```

### D) Playback Telemetry: Logging User & Audio Interactions
Logs telemetry metric points (streams, plays, downloads) to track project traction:

```typescript
const logActivity = async (activeTrackId: string, activeClientId: string, type: 'play' | 'download' | 'message') => {
  return withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        id: crypto.randomUUID(),
        type: type,
        user: 'Reviewer Client',
        action: type === 'play' ? 'Streamed reference mix' : 'Downloaded raw audio file',
        track_id: activeTrackId,
        client_id: activeClientId,
        timestamp: new Date().toISOString(),
      });
      
    if (error) console.error('Error logging client analytics:', error);
    return { data, error };
  });
};
```

---

## 4. Key Configurations recap
* **Client location:** `/src/lib/supabase.ts`
* **Vite Environment Variables:**
  * `VITE_SUPABASE_URL` = Your project endpoint (e.g., `https://yqtkfpaauzpcwzaopzhl.supabase.co`)
  * `VITE_SUPABASE_ANON_KEY` = Your public/client anonymized key
