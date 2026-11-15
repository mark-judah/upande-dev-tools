/**
 * Install reporting hook. The mobile kit's DeviceReporter takes over this job once the kit is
 * installed; until then this is a deliberate no-op so sign-in does not depend on it.
 */
export async function reportInstall(_info: { reason: string; user?: string }): Promise<void> {}
