export const runtime = "nodejs";
import { NextResponse } from "next/server";

type IncomingPayload = {
  descript_url?: string;
  make_webhook_url?: string;
};

type OutgoingPayload = {
  success: boolean;
  transcript?: string;
  metadata: {
    source_url?: string;
    transcript_json_url?: string;
    processing_time?: number;
  };
  error?: string;
};

const REQUEST_TIMEOUT_MS = 30_000;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      // Provide a UA to reduce chance of bot blocking
      headers: {
        "user-agent":
          (init.headers as Record<string, string> | undefined)?.["user-agent"] ??
          "Mozilla/5.0 (compatible; DescriptProxy/1.0; +https://vercel.com)",
        ...init.headers,
      },
      signal: abortController.signal,
      // Avoid Next caching for dynamic content
      cache: "no-store",
      redirect: "follow",
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTranscriptJsonUrlFromHtml(html: string): string | null {
  // Look for <meta property="descript:transcript" content="..." />
  // Use a resilient regex that tolerates attribute order and whitespace
  const metaRegex = /<meta\s+[^>]*property=["']descript:transcript["'][^>]*>/i;
  const tagMatch = html.match(metaRegex);
  if (!tagMatch) return null;

  const contentRegex = /content=["']([^"']+)["']/i;
  const contentMatch = tagMatch[0].match(contentRegex);
  return contentMatch ? contentMatch[1] : null;
}

function coerceToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function safeJoin(parts: Array<string | null | undefined>, separator = " "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(separator);
}

function formatTimestampSecondsToHHMMSS(seconds?: number): string | undefined {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return undefined;
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asArray(x: unknown): unknown[] | null {
  return Array.isArray(x) ? x : null;
}

function transformTranscriptJsonToText(jsonData: unknown): string {
  if (isRecord(jsonData)) {
    const segs = asArray(jsonData["segments"]);
    if (segs) {
      const lines: string[] = [];
      for (const segment of segs) {
        const r = isRecord(segment) ? segment : {};
        const speaker = coerceToString(r["speaker"]);
        const text = coerceToString(r["text"]);
        const start = typeof r["start"] === "number" ? (r["start"] as number) : undefined;
        const ts = formatTimestampSecondsToHHMMSS(start);
        const linePrefix = safeJoin([ts ? `[${ts}]` : undefined, speaker ? `${speaker}:` : undefined]);
        const line = safeJoin([linePrefix, text]);
        if (line) lines.push(line);
      }
      if (lines.length > 0) return lines.join("\n");
    }
  }

  if (isRecord(jsonData)) {
    const monos = asArray(jsonData["monologues"]);
    if (monos) {
      const lines: string[] = [];
      for (const mono of monos) {
        const r = isRecord(mono) ? mono : {};
        const speaker = coerceToString(r["speaker"]);
        const start = typeof r["start"] === "number" ? (r["start"] as number) : undefined;
        const ts = formatTimestampSecondsToHHMMSS(start);
        const elements = isRecord(mono) ? asArray(r["elements"]) : null;
        const text = elements
          ? elements
              .map((el) => (isRecord(el) ? coerceToString(el["value"]) : null))
              .filter((v): v is string => Boolean(v && v.trim()))
              .join("")
          : undefined;
        const linePrefix = safeJoin([ts ? `[${ts}]` : undefined, speaker ? `${speaker}:` : undefined]);
        const line = safeJoin([linePrefix, text]);
        if (line) lines.push(line);
      }
      if (lines.length > 0) return lines.join("\n");
    }
  }

  if (isRecord(jsonData)) {
    const paras = asArray(jsonData["paragraphs"]);
    if (paras) {
      const lines: string[] = [];
      for (const para of paras) {
        const r = isRecord(para) ? para : {};
        const speaker = coerceToString(r["speaker"]);
        const text = coerceToString(r["text"]);
        const start = typeof r["start"] === "number" ? (r["start"] as number) : undefined;
        const ts = formatTimestampSecondsToHHMMSS(start);
        const linePrefix = safeJoin([ts ? `[${ts}]` : undefined, speaker ? `${speaker}:` : undefined]);
        const line = safeJoin([linePrefix, text]);
        if (line) lines.push(line);
      }
      if (lines.length > 0) return lines.join("\n");
    }
  }

  if (isRecord(jsonData)) {
    const words = asArray(jsonData["words"]);
    if (words) {
      return words
        .map((w) => (isRecord(w) ? coerceToString(w["text"]) : null))
        .filter((t): t is string => Boolean(t && t.trim()))
        .join(" ");
    }
  }

  if (isRecord(jsonData) && typeof jsonData["text"] === "string") return jsonData["text"] as string;

  return "";
}

export async function GET(): Promise<Response> {
  const payload: OutgoingPayload = {
    success: true,
    transcript: undefined,
    metadata: {
      source_url: undefined,
      transcript_json_url: undefined,
      processing_time: 0,
    },
  };
  return NextResponse.json(payload, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  let body: IncomingPayload | null = null;
  try {
    body = (await request.json()) as IncomingPayload;
  } catch (error) {
    const payload: OutgoingPayload = {
      success: false,
      metadata: {},
      error: "Invalid JSON body",
    };
    return NextResponse.json(payload, { status: 400 });
  }

  const descriptUrl = body?.descript_url;
  const makeWebhookUrl = body?.make_webhook_url;

  if (!descriptUrl || typeof descriptUrl !== "string") {
    const payload: OutgoingPayload = {
      success: false,
      metadata: {},
      error: "Missing or invalid 'descript_url'",
    };
    return NextResponse.json(payload, { status: 400 });
  }

  if (!makeWebhookUrl || typeof makeWebhookUrl !== "string") {
    const payload: OutgoingPayload = {
      success: false,
      metadata: { source_url: descriptUrl },
      error: "Missing or invalid 'make_webhook_url'",
    };
    return NextResponse.json(payload, { status: 400 });
  }

  try {
    console.log("[descript-proxy] Fetching share page:", descriptUrl);
    const shareResponse = await fetchWithTimeout(descriptUrl, { method: "GET" });
    if (!shareResponse.ok) {
      const payload: OutgoingPayload = {
        success: false,
        metadata: { source_url: descriptUrl },
        error: `Failed to fetch Descript page: HTTP ${shareResponse.status}`,
      };
      return NextResponse.json(payload, { status: 502 });
    }

    const shareHtml = await shareResponse.text();
    const transcriptJsonUrl = extractTranscriptJsonUrlFromHtml(shareHtml);
    if (!transcriptJsonUrl) {
      const payload: OutgoingPayload = {
        success: false,
        metadata: { source_url: descriptUrl },
        error: "Unable to locate transcript JSON URL in page HTML",
      };
      return NextResponse.json(payload, { status: 422 });
    }

    console.log("[descript-proxy] Found transcript JSON URL:", transcriptJsonUrl);
    const transcriptResponse = await fetchWithTimeout(transcriptJsonUrl, { method: "GET" });
    if (!transcriptResponse.ok) {
      const payload: OutgoingPayload = {
        success: false,
        metadata: { source_url: descriptUrl, transcript_json_url: transcriptJsonUrl },
        error: `Failed to fetch transcript JSON: HTTP ${transcriptResponse.status}`,
      };
      return NextResponse.json(payload, { status: 502 });
    }

    let transcriptJson: unknown;
    try {
      transcriptJson = await transcriptResponse.json();
    } catch {
      const payload: OutgoingPayload = {
        success: false,
        metadata: { source_url: descriptUrl, transcript_json_url: transcriptJsonUrl },
        error: "Transcript JSON parsing failed",
      };
      return NextResponse.json(payload, { status: 422 });
    }

    const transcriptText = transformTranscriptJsonToText(transcriptJson);
    if (!transcriptText || transcriptText.trim().length === 0) {
      const payload: OutgoingPayload = {
        success: false,
        metadata: { source_url: descriptUrl, transcript_json_url: transcriptJsonUrl },
        error: "Transcript JSON did not contain recognizable text",
      };
      return NextResponse.json(payload, { status: 422 });
    }

    const durationMs = Date.now() - startedAt;
    const outgoing: OutgoingPayload = {
      success: true,
      transcript: transcriptText,
      metadata: {
        source_url: descriptUrl,
        transcript_json_url: transcriptJsonUrl,
        processing_time: durationMs,
      },
    };

    console.log("[descript-proxy] Posting results to Make webhook:", makeWebhookUrl);
    let webhookOk = false;
    let webhookStatus = 0;
    try {
      const webhookResponse = await fetchWithTimeout(
        makeWebhookUrl,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(outgoing),
        },
        REQUEST_TIMEOUT_MS
      );
      webhookOk = webhookResponse.ok;
      webhookStatus = webhookResponse.status;
      if (!webhookOk) {
        console.warn(
          `[descript-proxy] Make webhook responded with status ${webhookStatus}`
        );
      }
    } catch (err) {
      console.error("[descript-proxy] Error POSTing to Make webhook:", err);
    }

    // Respond to the caller regardless of webhook delivery result, but surface status
    const responsePayload: OutgoingPayload = webhookOk
      ? outgoing
      : {
          ...outgoing,
          success: false,
          error:
            webhookStatus > 0
              ? `Make webhook returned HTTP ${webhookStatus}`
              : "Failed to deliver results to Make webhook",
        };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err) {
    const payload: OutgoingPayload = {
      success: false,
      metadata: {},
      error: `Unexpected error: ${toErrorMessage(err)}`,
    };
    return NextResponse.json(payload, { status: 500 });
  }
}

