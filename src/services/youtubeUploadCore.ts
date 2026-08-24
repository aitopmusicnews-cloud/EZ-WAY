import type { PromoVideo } from '../types';

export const promoVideosForTrack = (
  promoVideos: PromoVideo[],
  trackId: string,
): PromoVideo[] => {
  const selectedTrackId = String(trackId || '').trim();
  if (!selectedTrackId) return [];
  return promoVideos.filter((video) => video.track_id === selectedTrackId);
};
