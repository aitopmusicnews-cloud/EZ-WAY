export type PremiumFeatureId = 'copyrights' | 'albumcover-studio';

/**
 * Single-user launch phase: premium-ready features stay enabled.
 * Later this boundary can consume subscription/entitlement state without
 * changing the feature components themselves.
 */
export const canUsePremiumFeature = (_feature: PremiumFeatureId): boolean => true;
