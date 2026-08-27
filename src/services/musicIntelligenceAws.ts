const cleanBase = (value: unknown) => String(value ?? '').trim().replace(/\/+$/, '');

export const resolveMusicIntelligenceReadBase = (
  explicitProfileApi: unknown,
  audioToolsApi: unknown,
): string => {
  const explicit = cleanBase(explicitProfileApi);
  if (explicit) return explicit;

  const audioTools = cleanBase(audioToolsApi);
  return audioTools ? `${audioTools}/track-analysis` : '';
};
