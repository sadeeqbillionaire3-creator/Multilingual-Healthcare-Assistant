export type GeminiFailureKind = "quota" | "timeout" | "temporary" | "permanent";

export interface GeminiFailureMetadata {
  kind: GeminiFailureKind;
  status?: number;
}

interface GeminiRetryOptions {
  timeoutMs?: number;
  maxTemporaryRetries?: number;
  maxTimeoutRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onRetry?: (details: GeminiFailureMetadata & { attempt: number; delayMs: number }) => void;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TEMPORARY_RETRIES = 2;
const DEFAULT_MAX_TIMEOUT_RETRIES = 1;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 2_000;

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function getNestedError(error: unknown) {
  const root = getRecord(error);
  const response = getRecord(root?.response);
  const responseData = getRecord(response?.data);
  const responseError = getRecord(responseData?.error);
  const nestedError = getRecord(root?.error);

  return { root, response, responseError, nestedError };
}

function getStatus(error: unknown): number | undefined {
  const { root, response, responseError, nestedError } = getNestedError(error);
  const candidates = [
    root?.status,
    root?.statusCode,
    response?.status,
    responseError?.code,
    responseError?.status,
    nestedError?.code,
    nestedError?.status,
  ];

  for (const candidate of candidates) {
    const status = typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && /^\d{3}$/.test(candidate)
        ? Number(candidate)
        : undefined;
    if (status && status >= 400 && status <= 599) return status;
  }

  return undefined;
}

function getErrorDetails(error: unknown): string {
  const { root, responseError, nestedError } = getNestedError(error);
  return [
    root?.name,
    root?.code,
    root?.message,
    root?.status,
    responseError?.status,
    responseError?.code,
    responseError?.message,
    nestedError?.status,
    nestedError?.code,
    nestedError?.message,
  ]
    .filter((part) => part !== undefined && part !== null)
    .map(String)
    .join(" ")
    .toUpperCase();
}

export function classifyGeminiFailure(
  error: unknown,
  requestTimedOut = false,
): GeminiFailureMetadata {
  const status = getStatus(error);
  const details = getErrorDetails(error);

  if (
    status === 429 ||
    /\b429\b/.test(details) ||
    details.includes("RESOURCE_EXHAUSTED") ||
    details.includes("QUOTA") ||
    details.includes("RATE LIMIT") ||
    details.includes("TOO MANY REQUESTS")
  ) {
    return { kind: "quota", status };
  }

  if (
    requestTimedOut ||
    /\b(ABORTERROR|TIMEOUTERROR|ETIMEDOUT|TIMED OUT|TIMEOUT|DEADLINE EXCEEDED)\b/.test(details)
  ) {
    return { kind: "timeout", status };
  }

  if (
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /\b(ECONNRESET|ECONNREFUSED|EAI_AGAIN|FETCH FAILED|SOCKET HANG UP|UNAVAILABLE|SERVICE UNAVAILABLE)\b/.test(details)
  ) {
    return { kind: "temporary", status };
  }

  return { kind: "permanent", status };
}

export class GeminiRecoveryError extends Error {
  readonly kind: GeminiFailureKind;
  readonly status?: number;

  constructor(metadata: GeminiFailureMetadata) {
    super(`Gemini request failed (${metadata.kind}).`);
    this.name = "GeminiRecoveryError";
    this.kind = metadata.kind;
    this.status = metadata.status;
  }
}

export function getGeminiFailureMetadata(error: unknown): GeminiFailureMetadata {
  if (error instanceof GeminiRecoveryError) {
    return { kind: error.kind, status: error.status };
  }
  return classifyGeminiFailure(error);
}

export async function generateWithGeminiRecovery<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: GeminiRetryOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTemporaryRetries = options.maxTemporaryRetries ?? DEFAULT_MAX_TEMPORARY_RETRIES;
  const maxTimeoutRetries = options.maxTimeoutRetries ?? DEFAULT_MAX_TIMEOUT_RETRIES;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  let retriesUsed = 0;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let failure: GeminiFailureMetadata;

    try {
      return await request(controller.signal);
    } catch (error) {
      failure = classifyGeminiFailure(error, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }

    const retriesAllowed = failure.kind === "temporary"
      ? maxTemporaryRetries
      : failure.kind === "timeout"
        ? maxTimeoutRetries
        : 0;

    if (retriesUsed >= retriesAllowed) {
      throw new GeminiRecoveryError(failure);
    }

    const delayMs = Math.min(
      initialDelayMs * 2 ** retriesUsed,
      maxDelayMs,
    );
    options.onRetry?.({
      ...failure,
      attempt: retriesUsed + 1,
      delayMs,
    });
    retriesUsed += 1;
    await sleep(delayMs);
  }
}
