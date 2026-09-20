import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudflareJevClient,
  FetchJevClient,
  createJevClient,
  defaultModelForProvider,
  resolveJevProvider,
} from "../src/client.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider resolution", () => {
  it("defaults to TypeSafe", () => {
    vi.stubEnv("JEV_PROVIDER", "");
    expect(resolveJevProvider()).toBe("typesafe");
  });

  it("honours JEV_PROVIDER", () => {
    vi.stubEnv("JEV_PROVIDER", "vercel");
    expect(resolveJevProvider()).toBe("vercel");
  });

  it("supports the cloudflare provider", () => {
    vi.stubEnv("JEV_PROVIDER", "cloudflare");
    expect(resolveJevProvider()).toBe("cloudflare");
    expect(defaultModelForProvider("cloudflare")).toBe("typesafe/jev");
  });

  it("honours JEV_MODEL", () => {
    vi.stubEnv("JEV_MODEL", "jev-test");
    expect(defaultModelForProvider("typesafe")).toBe("jev-test");
  });
});

describe.each([
  ["typesafe", "https://api.typesafe.ai/v1/systemone"],
  ["vercel", "https://ai-gateway.vercel.sh/typesafe/v1/systemone"],
] as const)("%s provider", (provider, expectedEndpoint) => {
  it("uses the TypeSafe-compatible System One transport", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(expectedEndpoint);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "jev-test",
        state: { ticket: "hello" },
        questions: { urgent: { type: "fixture" } },
      });
      return new Response(JSON.stringify({
        model: "jev-test",
        answers: { urgent: { noul: 0.8 } },
        usage: { input_tokens: 10, output_tokens: 2 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = createJevClient({
      provider,
      apiKey: "test-key",
      model: "jev-test",
      fetchImpl,
    });

    const response = await client.systemOne({
      state: { ticket: "hello" },
      questions: { urgent: { type: "fixture" } },
    });

    expect(response.answers).toEqual({ urgent: { noul: 0.8 } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("CloudflareJevClient", () => {
  it("sends Cloudflare's input envelope and unwraps its nested response", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "typesafe/jev",
        input: {
          state: { ticket: "hello" },
          questions: { urgent: { type: "fixture" } },
        },
      });
      return new Response(JSON.stringify({
        result: {
          state: "Completed",
          result: {
            model: "jev-1.13.0",
            answers: { urgent: { type: "noul", noul: 0.94 } },
            usage: { input_tokens: 10, output_tokens: 2 },
          },
          gatewayMetadata: { keySource: "Unified" },
        },
        success: true,
        errors: [],
        messages: [],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = new CloudflareJevClient({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run",
      apiKey: "test-token",
      fetchImpl,
    });

    const response = await client.systemOne({
      state: { ticket: "hello" },
      questions: { urgent: { type: "fixture" } },
    });

    expect(response).toEqual({
      model: "jev-1.13.0",
      answers: { urgent: { type: "noul", noul: 0.94 } },
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("FetchJevClient", () => {
  it("sends a System One compatible request", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "jev-test",
        state: { ticket: "hello" },
        questions: { urgent: { type: "fixture" } },
      });
      return new Response(JSON.stringify({
        model: "jev-test",
        answers: { urgent: { noul: 0.8 } },
        usage: { input_tokens: 10, output_tokens: 2 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = new FetchJevClient({
      endpoint: "https://example.test/v1/systemone",
      model: "jev-test",
      apiKey: "test-key",
      fetchImpl,
    });

    const response = await client.systemOne({
      state: { ticket: "hello" },
      questions: { urgent: { type: "fixture" } },
    });

    expect(response.answers).toEqual({ urgent: { noul: 0.8 } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
