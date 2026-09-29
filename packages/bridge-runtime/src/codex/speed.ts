/** Native catalog IDs are authoritative; never infer support from model names. */
export function fastServiceTier(model: any): string | undefined {
  if (Array.isArray(model?.serviceTiers)) {
    return model.serviceTiers.find((tier: any) => typeof tier?.id === 'string'
      && (isFastServiceTier(tier.id) || /^(fast|priority)$/i.test(tier.name?.trim() ?? '')))?.id;
  }
  return Array.isArray(model?.additionalSpeedTiers)
    ? model.additionalSpeedTiers.find(isFastServiceTier) : undefined;
}

export function isFastServiceTier(tier: unknown): boolean {
  return tier === 'fast' || tier === 'priority';
}

export function hasServiceTier(value: any): value is { serviceTier: string | null } {
  return value != null && Object.hasOwn(value, 'serviceTier')
    && (value.serviceTier === null || typeof value.serviceTier === 'string');
}
