# EZ-WAY Copyrights Integration Design

## Goal

Add a native **Copyrights** feature to EZ-WAY that replaces the current Releases navigation entry, lets the user select an existing EZ-WAY track from a dropdown, auto-fills copyright evidence information from the track and Music Intelligence data, and reuses the core EZCopyright evidence-generation behavior without forcing a second upload or a second visible app experience.

The feature must be premium-ready, but it must **not be paywalled yet**. The same feature boundary should later support premium gating and other premium-native tools such as **EZ AI Albumcover Studio**.

## Scope

This design covers the native Copyrights integration only. It does not integrate EZ AI Albumcover Studio yet. It creates a shared entitlement boundary that EZ AI Albumcover Studio can reuse later.

This workflow creates a timestamped copyright evidence record and certificate. It is not an official U.S. Copyright Office filing, and the UI must preserve that distinction.

## Architecture

Build a native EZ-WAY Copyrights page with three isolated pieces:

1. `copyrightsCore.ts`: pure track-to-draft mapping and evidence/hash helpers.
2. `copyrights.ts`: browser-backed repository plus audio resolution.
3. `CopyrightsStudio.tsx`: native EZ-WAY UI using the shared track library and Music Intelligence data.

The first release does not call EZCopyright's authenticated backend because EZ-WAY does not currently expose the same Cognito token/session flow and the user is currently the only user. This avoids a second login. The service boundary is intentionally shaped so browser storage can later be replaced by an authenticated AWS/EZCopyright repository without rewriting the page.

## Navigation

Replace the visible **Releases** sidebar item with **Copyrights** using view id `copyrights` on desktop and mobile. Remove `ReleasesHub` from the app routing/render path. Delete the component if it becomes unused.

## Track Selection and Prefill

The Copyrights page follows Music Video Maker's library-first UX: **Select Track** from a dropdown, then auto-fill the review form. Selecting a track never registers automatically.

Map fields as follows:

- `title` <- `track.name`
- `artist` <- `track.artist`
- `lyrics` <- `track.lyrics || ''`
- `dateCreated` <- date portion of `track.created_at` when valid
- `fileType` <- `track.type`
- `fileSize` <- `track.size`
- `fileName` <- derive from `track.file_url` when possible, otherwise a stable name from track title/type
- `genre` <- Music Intelligence primary genre when available, else `genre_category:` tag, else blank
- `description` <- compact available genre/mood/style/BPM/key/instruments/keywords summary
- `coArtists` <- blank and editable

Do not invent ownership, authorship, contributors, or creation dates.

## Audio and Evidence

The exact selected audio master is the evidence source. Resolution order:

1. `track.file_data` when present and usable;
2. fetch `track.file_url` when present;
3. fail with a clear user-facing error.

Do not hash a URL or metadata in place of audio bytes.

On **Register Copyright Evidence**:

1. resolve audio bytes;
2. compute SHA-256 of the audio;
3. create timestamp and registration number;
4. create a digital fingerprint from title, artist, timestamp, and file hash;
5. save the record;
6. show certificate/evidence details.

## Data Types

```ts
export interface CopyrightDraft {
  trackId: string;
  title: string;
  artist: string;
  coArtists: string;
  genre: string;
  description: string;
  lyrics: string;
  dateCreated: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface CopyrightEvidenceRecord extends CopyrightDraft {
  id: string;
  dateRegistered: string;
  registrationNumber: string;
  digitalFingerprint: string;
  fileHash: string;
  status: 'registered';
  evidenceVersion: 'ezcopyright-v1';
}
```

## Core Interfaces

```ts
export function buildCopyrightDraft(
  track: Track,
  profile?: MusicIntelligenceProfile | null,
): CopyrightDraft;

export async function createCopyrightEvidence(
  draft: CopyrightDraft,
  audio: Blob,
  options?: { now?: Date; id?: string; registrationNumber?: string },
): Promise<CopyrightEvidenceRecord>;

export interface CopyrightRepository {
  list(): Promise<CopyrightEvidenceRecord[]>;
  listByTrackId(trackId: string): Promise<CopyrightEvidenceRecord[]>;
  save(record: CopyrightEvidenceRecord): Promise<void>;
  remove(id: string): Promise<void>;
}
```

## Registered State and Certificate

Show **Registered** for tracks with evidence history, plus latest registration number and timestamp. The page lists prior records, supports viewing a record, and provides a certificate download action.

The certificate must show title, artist, registration number, registration timestamp, SHA-256 hash, digital fingerprint, evidence version, and an explicit evidence-record disclaimer. It must not imply government registration.

## Premium-Ready Boundary

Create a shared entitlement module now:

```ts
export type PremiumFeatureId = 'copyrights' | 'albumcover-studio';

export function canUsePremiumFeature(feature: PremiumFeatureId): boolean {
  return true;
}
```

Copyrights remains enabled now. Later subscription logic must be wired through this boundary rather than embedded throughout the feature. The exact future feature id is `albumcover-studio`, representing **EZ AI Albumcover Studio**.

## Testing

Use TDD for pure logic:

- track-to-draft mapping with and without Music Intelligence;
- no invented contributor data;
- valid date/file-name fallbacks;
- SHA-256 evidence generation using deterministic test inputs;
- registration record shape and evidence version;
- entitlement returns enabled for Copyrights and Albumcover Studio for the current single-user phase.

Then run the existing Music Intelligence tests and a production build. The app must build with `ReleasesHub` removed and `CopyrightsStudio` routed through `copyrights`.
