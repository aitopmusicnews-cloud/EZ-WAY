import type { PromoVideo } from '../types';

// Keep YouTube's promo-video chooser scoped to the track selected first.
export const promoVideosForTrack = (
  promoVideos: PromoVideo[],
  trackId: string,
): PromoVideo[] => {
  const selectedTrackId = String(trackId || '').trim();
  if (!selectedTrackId) return [];
  return promoVideos.filter((video) => video.track_id === selectedTrackId);
};
