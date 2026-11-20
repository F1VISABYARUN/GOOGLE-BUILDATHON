import { useEffect, useState } from 'react';

interface HelloResponse {
  model: string;
  text: string;
  latencyMs: number;
}

export default function App() {
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [helloReply, setHelloReply] = useState<HelloResponse | null>(null);
  const [helloLoading, setHelloLoading] = useState(false);
  const [helloError, setHelloError] = useState<string | null>(null);

  async function loadModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not load available Gemini models.');
      }
      setModels(Array.isArray(data.models) ? data.models : []);
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to load models.');
    } finally {
      setModelsLoading(false);
    }
  }

  useEffect(() => {
    loadModels();
  }, []);

  async function handleSayHello() {
    setHelloLoading(true);
    setHelloError(null);
    try {
      const res = await fetch('/api/hello', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gemini could not reply right now.');
      }
      setHelloReply(data as HelloResponse);
    } catch (err) {
      setHelloError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setHelloLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Phase 1 — Live Gemini Connection
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Aira Application Agent
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-700">
            Verify student documents, check application rules in code, and keep a human
            counselor in charge before any application is submitted.
          </p>
        </header>

        <section
          aria-labelledby="gemini-test-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 id="gemini-test-heading" className="text-2xl font-semibold text-slate-950">
            Test Live Gemini Reply
          </h2>
          <p className="mt-2 text-base text-slate-700">
            Press the button below to call our server and get a real reply from Gemini.
          </p>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleSayHello}
              disabled={helloLoading}
              className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
            >
              {helloLoading ? 'Asking Gemini...' : 'Ask Gemini to Say Hello'}
            </button>
          </div>

          {helloError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900"
            >
              <p className="font-semibold">Something went wrong</p>
              <p className="mt-1">{helloError}</p>
            </div>
          )}

          {helloReply && (
            <div
              aria-live="polite"
              className="mt-5 space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-slate-900"
            >
              <p className="text-lg font-medium leading-relaxed">{helloReply.text}</p>
              <div className="flex flex-wrap gap-3 text-sm font-medium text-emerald-900">
                <span className="rounded-lg bg-emerald-100 px-3 py-1">
                  Model: {helloReply.model}
                </span>
                <span className="rounded-lg bg-emerald-100 px-3 py-1">
                  Response time: {helloReply.latencyMs} ms
                </span>
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="models-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="models-heading" className="text-2xl font-semibold text-slate-950">
              Available Gemini Models
            </h2>
            <button
              type="button"
              onClick={loadModels}
              disabled={modelsLoading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50"
            >
              {modelsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <p className="mt-2 text-base text-slate-700">
            Live list from Google AI filtered to Gemini 4 and Gemini 3.8 models.
          </p>

          {modelsError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900"
            >
              {modelsError}
            </div>
          )}

          {!modelsLoading && !modelsError && models.length === 0 && (
            <p className="mt-4 text-base text-slate-700">
              No Gemini 4 or Gemini 3.8 models were returned for this key.
            </p>
          )}

          {models.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {models.map((name) => (
                <li
                  key={name}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base text-slate-900"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
