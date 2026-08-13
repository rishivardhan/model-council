// Shared config for talking to the Model Council FastAPI backend.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const COUNCIL_STREAM_URL = `${BACKEND_URL}/api/council/stream`;
