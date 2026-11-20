import crypto from 'node:crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let secretClient: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!secretClient) {
    secretClient = new SecretManagerServiceClient();
  }
  return secretClient;
}

export function generateStrongPortalPassword(): string {
  return `Aira!${crypto.randomBytes(12).toString('base64url')}9z`;
}

/**
 * Generates a unique password per portal and stores it ONLY in Google Secret Manager.
 * NEVER stored in Firestore, logs, commits, or UI.
 */
export async function getOrCreatePortalPassword(params: {
  caseId: string;
  portalDomain: string;
}): Promise<{ password: string; secretName: string; storedInSecretManager: boolean }> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6';
  const domainHash = crypto
    .createHash('sha256')
    .update(params.portalDomain.toLowerCase())
    .digest('hex')
    .slice(0, 10);
  const safeCase = params.caseId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const secretId = `portal-pwd-${safeCase}-${domainHash}`;
  const parent = `projects/${projectId}`;
  const secretName = `${parent}/secrets/${secretId}`;

  try {
    const client = getClient();
    // Try to read existing password version first
    try {
      const [version] = await client.accessSecretVersion({
        name: `${secretName}/versions/latest`,
      });
      const existing = version.payload?.data?.toString('utf8').trim();
      if (existing) {
        return { password: existing, secretName, storedInSecretManager: true };
      }
    } catch {
      // Secret does not exist yet — create it below
    }

    const password = generateStrongPortalPassword();
    try {
      await client.createSecret({
        parent,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch {
      // Secret container may already exist
    }
    await client.addSecretVersion({
      parent: secretName,
      payload: { data: Buffer.from(password, 'utf8') },
    });
    console.info(`[agent-secrets] Stored per-portal password in Secret Manager (${secretId})`);
    return { password, secretName, storedInSecretManager: true };
  } catch (err) {
    console.warn(
      `[agent-secrets] Secret Manager unavailable locally, using ephemeral in-memory password:`,
      err instanceof Error ? err.message : String(err)
    );
    return {
      password: generateStrongPortalPassword(),
      secretName: `ephemeral:${secretId}`,
      storedInSecretManager: false,
    };
  }
}
