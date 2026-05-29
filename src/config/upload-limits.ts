/** Max onboarding / KYC multipart upload size (default 10 MB). */
export function getOnboardingImageMaxBytes(): number {
  const fromMb = Number(process.env.ONBOARDING_IMAGE_MAX_MB ?? "10");
  if (Number.isFinite(fromMb) && fromMb > 0) {
    return Math.floor(fromMb * 1024 * 1024);
  }
  return 10 * 1024 * 1024;
}

export function onboardingImageMaxMbLabel(): string {
  const mb = getOnboardingImageMaxBytes() / 1024 / 1024;
  return `${mb} MB`;
}
