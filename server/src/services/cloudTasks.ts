import { CloudTasksClient } from '@google-cloud/tasks';

let tasksClient: CloudTasksClient | null = null;

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient();
  }
  return tasksClient;
}

export interface EnqueueAgentTaskParams {
  runId: string;
  safetyAcknowledged?: boolean;
}

export interface EnqueueAgentTaskResult {
  dispatchedVia: 'cloud_tasks' | 'direct_http';
  taskName?: string;
}

/**
 * Enqueues a computer-use agent run onto Google Cloud Tasks (`aira-agent-queue` in `asia-south1`),
 * calling the private `--no-allow-unauthenticated` Cloud Run service `aira-agent` with an OIDC token.
 */
export async function enqueueAgentRunTask(
  params: EnqueueAgentTaskParams
): Promise<EnqueueAgentTaskResult> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6';
  const location = process.env.CLOUD_TASKS_LOCATION || 'asia-south1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'aira-agent-queue';
  const workerUrl = process.env.AGENT_WORKER_URL?.trim();
  const invokerEmail = process.env.AGENT_INVOKER_SA?.trim();

  if (!workerUrl) {
    throw new Error(
      'AGENT_WORKER_URL is not configured yet. Deploy aira-agent and set AGENT_WORKER_URL on aira-web.'
    );
  }

  const targetUrl = `${workerUrl.replace(/\/+$/, '')}/tasks/run-agent`;
  const payloadJson = JSON.stringify({
    runId: params.runId,
    safetyAcknowledged: Boolean(params.safetyAcknowledged),
  });

  const client = getTasksClient();
  const parent = client.queuePath(project, location, queue);

  const httpRequest: Record<string, unknown> = {
    httpMethod: 'POST',
    url: targetUrl,
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(payloadJson).toString('base64'),
  };

  if (invokerEmail) {
    httpRequest.oidcToken = {
      serviceAccountEmail: invokerEmail,
      audience: workerUrl,
    };
  }

  const [response] = await client.createTask({
    parent,
    task: {
      httpRequest,
      dispatchDeadline: { seconds: 900 }, // 15 min max matching aira-agent Cloud Run timeout
    },
  });

  console.info(
    `[cloud-tasks] Enqueued agent task for runId=${params.runId} task=${response.name}`
  );
  return {
    dispatchedVia: 'cloud_tasks',
    taskName: response.name ?? undefined,
  };
}
