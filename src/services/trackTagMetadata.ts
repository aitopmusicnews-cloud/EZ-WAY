export interface TrackTagInfo {
  camelotKey: string;
  genreCategory: string;
  mood: string;
  vibe: string;
  instruments: string;
  pitch: string;
  cleanTags: string[];
}

export const getTrackInfoFromTags = (tags: string[] | undefined | null): TrackTagInfo => {
  const info: TrackTagInfo = {
    camelotKey: '',
    genreCategory: '',
    mood: '',
    vibe: '',
    instruments: '',
    pitch: '',
    cleanTags: [],
  };

  if (!tags || !Array.isArray(tags)) return info;

  tags.forEach((tag) => {
    if (!tag) return;
    if (tag.startsWith('camelot_key:')) {
      info.camelotKey = tag.replace('camelot_key:', '').trim();
    } else if (tag.startsWith('genre_category:')) {
      info.genreCategory = tag.replace('genre_category:', '').trim();
    } else if (tag.startsWith('mood:')) {
      info.mood = tag.replace('mood:', '').trim();
    } else if (tag.startsWith('vibe:')) {
      info.vibe = tag.replace('vibe:', '').trim();
    } else if (tag.startsWith('instruments:')) {
      info.instruments = tag.replace('instruments:', '').trim();
    } else if (tag.startsWith('pitch:')) {
      info.pitch = tag.replace('pitch:', '').trim();
    } else if (tag.startsWith('genre_override:') || tag.startsWith('analysis_version:')) {
      // Internal metadata controls analyzer behavior and is never a visible tag.
    } else {
      info.cleanTags.push(tag);
    }
  });

  return info;
};
