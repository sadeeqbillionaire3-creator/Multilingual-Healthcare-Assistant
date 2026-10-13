export type WhatsAppGraphFailureKind =
  | "configuration"
  | "network"
  | "timeout"
  | "rejected"
  | "invalid_response";

export class WhatsAppGraphApiError extends Error {
  readonly kind: WhatsAppGraphFailureKind;
  readonly status?: number;

  constructor(kind: WhatsAppGraphFailureKind, status?: number) {
    super(
      kind === "rejected" && status
        ? `WhatsApp Graph API rejected the message with HTTP ${status}.`
        : `WhatsApp Graph API request failed (${kind}).`,
    );
    this.name = "WhatsAppGraphApiError";
    this.kind = kind;
    this.status = status;
  }
}

interface SubmitWhatsAppTextOptions {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  reply: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export async function submitWhatsAppText({
  phoneNumberId,
  accessToken,
  to,
  reply,
  fetcher,
  timeoutMs = 10_000,
}: SubmitWhatsAppTextOptions): Promise<{
  status: number;
  accepted: true;
  providerMessageIdPresent: true;
}> {
  if (!phoneNumberId || !accessToken) {
    throw new WhatsAppGraphApiError("configuration");
  }

  const requestSignal = AbortSignal.timeout(timeoutMs);
  const send = fetcher ?? fetch;
  let response: Response;

  try {
    response = await send(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: reply },
        }),
        signal: requestSignal,
      },
    );
  } catch {
    throw new WhatsAppGraphApiError(requestSignal.aborted ? "timeout" : "network");
  }

  if (!response.ok) {
    throw new WhatsAppGraphApiError("rejected", response.status);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new WhatsAppGraphApiError("invalid_response", response.status);
  }

  const messages = responseBody && typeof responseBody === "object"
    ? (responseBody as { messages?: unknown }).messages
    : undefined;
  const hasAcceptedMessageId =
    Array.isArray(messages) &&
    messages.some((message) => {
      if (!message || typeof message !== "object") return false;
      const id = (message as { id?: unknown }).id;
      return typeof id === "string" && id.length > 0;
    });

  if (!hasAcceptedMessageId) {
    throw new WhatsAppGraphApiError("invalid_response", response.status);
  }

  return {
    status: response.status,
    accepted: true,
    providerMessageIdPresent: true,
  };
}
