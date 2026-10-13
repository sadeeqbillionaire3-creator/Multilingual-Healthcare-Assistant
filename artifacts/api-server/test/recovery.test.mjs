import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { after, test } from "node:test";
import { build, transform } from "esbuild";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { code } = await transform(source, {
    format: "esm",
    loader: "ts",
    target: "node20",
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function loadWhatsAppRoute() {
  const temporaryDirectory = await mkdtemp(
    path.join(testDirectory, ".whatsapp-route-test-"),
  );
  const outputPath = path.join(temporaryDirectory, "route.mjs");

  try {
    await build({
      entryPoints: [path.join(testDirectory, "../src/routes/whatsapp.ts")],
      outfile: outputPath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      target: "node20",
    });
    const route = await import(pathToFileURL(outputPath).href);
    return {
      route,
      cleanup: () => rm(temporaryDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

const recovery = await loadTypeScript("../src/lib/gemini-recovery.ts");
const whatsappCloud = await loadTypeScript("../src/lib/whatsapp-cloud.ts");
const whatsappRouteModule = await loadWhatsAppRoute();
const whatsappRoute = whatsappRouteModule.route;
after(whatsappRouteModule.cleanup);

function createTextEvent(messageId, text) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: messageId,
            from: "15550000000",
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

function captureLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      info: (...args) => entries.push({ level: "info", args }),
      error: (...args) => entries.push({ level: "error", args }),
    },
  };
}

async function deliverWebhook(processor, event) {
  let ackStatus;
  let processing;
  const handler = whatsappRoute.createWhatsAppPostHandler((body) => {
    assert.equal(ackStatus, 200, "webhook must acknowledge before processing");
    processing = processor(body);
    return processing;
  });
  const response = {
    headersSent: false,
    sendStatus(status) {
      ackStatus = status;
      this.headersSent = true;
      return this;
    },
  };

  handler({ body: event }, response);
  assert.equal(ackStatus, 200);
  await processing;
  return ackStatus;
}

test("retries temporary Gemini 503s with bounded exponential delays", async () => {
  let calls = 0;
  const delays = [];
  const value = await recovery.generateWithGeminiRecovery(
    async () => {
      calls += 1;
      if (calls < 3) throw { status: 503, message: "UNAVAILABLE" };
      return "ok";
    },
    { sleep: async (delay) => delays.push(delay) },
  );

  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1_000]);
});

test("does not retry quota or rate-limit errors", async () => {
  for (const failure of [
    { status: 429, message: "rate limit" },
    { status: 400, message: "RESOURCE_EXHAUSTED: quota exceeded" },
  ]) {
    let calls = 0;
    await assert.rejects(
      recovery.generateWithGeminiRecovery(async () => {
        calls += 1;
        throw failure;
      }),
      (error) => error.kind === "quota",
    );
    assert.equal(calls, 1);
  }
});

test("bounds Gemini timeout retries and classifies the final failure", async () => {
  let calls = 0;
  await assert.rejects(
    recovery.generateWithGeminiRecovery(
      (_signal) => {
        calls += 1;
        return new Promise((_, reject) => {
          _signal.addEventListener("abort", () => reject(_signal.reason), { once: true });
        });
      },
      { timeoutMs: 5, sleep: async () => undefined },
    ),
    (error) => error.kind === "timeout",
  );
  assert.equal(calls, 2);
});

test("does not retry permanent Gemini errors", async () => {
  let calls = 0;
  await assert.rejects(
    recovery.generateWithGeminiRecovery(async () => {
      calls += 1;
      throw { status: 400, message: "invalid request" };
    }),
    (error) => error.kind === "permanent",
  );
  assert.equal(calls, 1);
});

test("submits the localized WhatsApp fallback through the Cloud API request", async () => {
  let captured;
  const result = await whatsappCloud.submitWhatsAppText({
    phoneNumberId: "test-phone-id",
    accessToken: "test-token",
    to: "15550000000",
    reply: "Désolé, veuillez réessayer.",
    fetcher: async (url, options) => {
      captured = { url, options };
      return new Response('{"messages":[{"id":"wamid.test"}]}', { status: 200 });
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, 200);
  assert.equal(result.providerMessageIdPresent, true);
  assert.equal(captured.url, "https://graph.facebook.com/v21.0/test-phone-id/messages");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(captured.options.body), {
    messaging_product: "whatsapp",
    to: "15550000000",
    type: "text",
    text: { body: "Désolé, veuillez réessayer." },
  });
});

test("does not report a successful Graph request without an accepted message id", async () => {
  await assert.rejects(
    whatsappCloud.submitWhatsAppText({
      phoneNumberId: "test-phone-id",
      accessToken: "test-token",
      to: "15550000000",
      reply: "fallback",
      fetcher: async () => new Response('{"messages":[]}', { status: 200 }),
    }),
    (error) => error.kind === "invalid_response" && error.status === 200,
  );
});

test("does not expose WhatsApp credentials or content in Graph API errors", async () => {
  await assert.rejects(
    whatsappCloud.submitWhatsAppText({
      phoneNumberId: "test-phone-id",
      accessToken: "test-token",
      to: "15550000000",
      reply: "private fallback",
      fetcher: async () => new Response("{}", { status: 401 }),
    }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message.includes("test-token"), false);
      assert.equal(error.message.includes("private fallback"), false);
      return true;
    },
  );
});

test("exhausts persistent Gemini 503 retries, selects French fallback, and submits it once", async () => {
  let generationCalls = 0;
  const delays = [];
  const sentMessages = [];
  const logs = captureLogger();
  const processor = whatsappRoute.createWhatsAppWebhookProcessor({
    messageIds: new Map(),
    logger: logs.logger,
    generateReply: async () => recovery.generateWithGeminiRecovery(
      async () => {
        generationCalls += 1;
        throw { status: 503, message: "UNAVAILABLE" };
      },
      { sleep: async (delay) => delays.push(delay) },
    ),
    sendMessage: async (to, reply) => {
      sentMessages.push({ to, reply });
    },
  });

  const ackStatus = await deliverWebhook(
    processor,
    createTextEvent("wamid-persistent-503", "Bonjour, j'ai une question"),
  );

  assert.equal(ackStatus, 200);
  assert.equal(generationCalls, 3);
  assert.deepEqual(delays, [500, 1_000]);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "15550000000");
  assert.equal(
    sentMessages[0].reply,
    "Désolé, je n'ai pas pu préparer une réponse. Veuillez réessayer dans un instant.\n\nAvertissement: Ceci n'est pas un diagnostic médical. Veuillez consulter un médecin qualifié.",
  );
  assert.equal(JSON.stringify(logs.entries).includes("UNAVAILABLE"), false);
});

test("after a fallback send rejection, redelivery of the same ID is acknowledged but not resent", async () => {
  let generationCalls = 0;
  const outboundAttempts = [];
  const ackStatuses = [];
  const processingPromises = [];
  const logs = captureLogger();
  const processor = whatsappRoute.createWhatsAppWebhookProcessor({
    messageIds: new Map(),
    logger: logs.logger,
    generateReply: async () => {
      generationCalls += 1;
      throw Object.assign(new Error("temporary provider failure"), { status: 503 });
    },
    sendMessage: async (to, reply) => {
      outboundAttempts.push({ to, reply });
      throw new Error("mock Graph rejection: Bearer mock-token private fallback");
    },
  });
  const event = createTextEvent("wamid-send-failure", "Bonjour, j'ai une question");
  const handler = whatsappRoute.createWhatsAppPostHandler((body) => {
    const processing = processor(body);
    processingPromises.push(processing);
    return processing;
  });

  for (let delivery = 0; delivery < 2; delivery += 1) {
    const response = {
      headersSent: false,
      sendStatus(status) {
        ackStatuses.push(status);
        this.headersSent = true;
        return this;
      },
    };
    handler({ body: event }, response);
    assert.equal(ackStatuses.at(-1), 200);
  }
  await Promise.all(processingPromises);

  assert.equal(generationCalls, 1);
  assert.equal(outboundAttempts.length, 1);
  assert.match(outboundAttempts[0].reply, /^Désolé,/);
  assert.deepEqual(ackStatuses, [200, 200]);
  const serializedLogs = JSON.stringify(logs.entries);
  assert.equal(serializedLogs.includes("mock-token"), false);
  assert.equal(serializedLogs.includes("private fallback"), false);
  assert.equal(serializedLogs.includes("Skipping duplicate"), true);
});

test("different Meta IDs with identical text are processed independently", async () => {
  const generatedMessages = [];
  const sentMessages = [];
  const processor = whatsappRoute.createWhatsAppWebhookProcessor({
    messageIds: new Map(),
    logger: captureLogger().logger,
    generateReply: async (text, language) => {
      generatedMessages.push({ text, language });
      return { language, reply: "I can help with your health question." };
    },
    sendMessage: async (to, reply) => {
      sentMessages.push({ to, reply });
    },
  });

  await deliverWebhook(
    processor,
    createTextEvent("wamid-distinct-1", "I have a health question"),
  );
  await deliverWebhook(
    processor,
    createTextEvent("wamid-distinct-2", "I have a health question"),
  );

  assert.equal(generatedMessages.length, 2);
  assert.deepEqual(
    generatedMessages.map((message) => message.text),
    ["I have a health question", "I have a health question"],
  );
  assert.equal(sentMessages.length, 2);
});
