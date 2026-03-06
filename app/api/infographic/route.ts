import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import {
  buildNotebookLmInfographicPrompt,
  infographicPayloadToMarkdown,
  InfographicPayload,
} from "@/lib/infographic";
import { renderInfographicSvg } from "@/lib/infographicLocalRenderer";

export const runtime = "nodejs";
export const maxDuration = 120;

interface InfographicBody {
  payload?: InfographicPayload;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function safeJsonParse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function extractFirstString(
  source: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function tryExtractBase64Image(dataUrl?: string): Buffer | null {
  if (!dataUrl) return null;
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

async function runNotebookLm(
  args: string[],
  timeoutMs = 120000
): Promise<CommandResult> {
  const cmd = process.platform === "win32" ? "notebooklm.cmd" : "notebooklm";
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`NotebookLM timeout (${args.join(" ")})`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `NotebookLM command failed (${exitCode})`);
  }

  return { stdout, stderr };
}

async function tryNotebookLmGeneration(
  payload: InfographicPayload
): Promise<Buffer | null> {
  const listResult = await runNotebookLm(["list", "--json"], 30000);
  const listJson = safeJsonParse<Record<string, unknown>>(listResult.stdout);
  if (listJson.error) {
    return null;
  }

  const notebookTitle = `Infografia ${payload.reportContext.agentName} ${new Date().toISOString()}`;
  const createResult = await runNotebookLm(["create", notebookTitle, "--json"], 30000);
  const createJson = safeJsonParse<Record<string, unknown>>(createResult.stdout);
  const notebookId =
    extractFirstString(createJson, ["id", "notebookId", "notebook_id"]) ||
    extractFirstString(createJson, ["uuid"]);
  if (!notebookId) {
    throw new Error("No se pudo obtener notebookId de NotebookLM.");
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "metaeval-infographic-"));
  try {
    const markdownPath = path.join(tmpDir, "infographic-data.md");
    await fs.writeFile(markdownPath, infographicPayloadToMarkdown(payload), "utf8");
    await runNotebookLm(
      [
        "source",
        "add",
        markdownPath,
        "--type",
        "file",
        "--mime-type",
        "text/markdown",
        "--title",
        "Datos de evaluacion",
        "--json",
        "-n",
        notebookId,
      ],
      45000
    );

    const imageBuffer = tryExtractBase64Image(payload.panoramaChartDataUrl);
    if (imageBuffer) {
      const imagePath = path.join(tmpDir, "panorama.png");
      await fs.writeFile(imagePath, imageBuffer);
      await runNotebookLm(
        [
          "source",
          "add",
          imagePath,
          "--type",
          "file",
          "--mime-type",
          "image/png",
          "--title",
          "Panorama general",
          "--json",
          "-n",
          notebookId,
        ],
        45000
      );
    }

    const prompt = buildNotebookLmInfographicPrompt(payload);
    const generateResult = await runNotebookLm(
      [
        "generate",
        "infographic",
        prompt,
        "--orientation",
        "landscape",
        "--detail",
        "detailed",
        "--language",
        "es",
        "--wait",
        "--json",
        "-n",
        notebookId,
      ],
      12 * 60 * 1000
    );
    const generateJson = safeJsonParse<Record<string, unknown>>(generateResult.stdout);
    const artifactId =
      extractFirstString(generateJson, ["id", "artifactId", "artifact_id"]) ||
      extractFirstString(generateJson, ["uuid"]);

    const outputPath = path.join(tmpDir, "infografia.png");
    const downloadArgs = ["download", "infographic", outputPath, "--force", "--json", "-n", notebookId];
    if (artifactId) {
      downloadArgs.push("-a", artifactId);
    }
    await runNotebookLm(downloadArgs, 120000);

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function tryOpenAiFallback(payload: InfographicPayload): Promise<Buffer | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    `Create a polished infographic in Spanish with a clean corporate style.`,
    `Use exactly these key facts and do not invent numbers.`,
    infographicPayloadToMarkdown(payload),
  ].join("\n\n");

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}

function tryReadPayload(body: InfographicBody): InfographicPayload | null {
  if (!body.payload || typeof body.payload !== "object") return null;
  const payload = body.payload;
  if (!payload.reportContext || !payload.kpis || !Array.isArray(payload.dimensions)) return null;
  return payload;
}

export async function POST(request: NextRequest) {
  const accessKey = request.headers.get("x-access-key");
  if (accessKey !== process.env.ACCESS_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: InfographicBody;
  try {
    body = (await request.json()) as InfographicBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const payload = tryReadPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Payload de infografia invalido" }, { status: 400 });
  }

  try {
    const notebookImage = await tryNotebookLmGeneration(payload);
    if (notebookImage) {
      return new NextResponse(new Uint8Array(notebookImage), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="infografia-${randomUUID()}.png"`,
          "x-infographic-source": "notebooklm",
        },
      });
    }
  } catch {
    // Proceed with fallbacks.
  }

  try {
    const localSvg = renderInfographicSvg(payload);
    return new NextResponse(localSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="infografia-${randomUUID()}.svg"`,
        "x-infographic-source": "local-svg",
      },
    });
  } catch {
    // Last fallback (optional).
  }

  try {
    const openaiImage = await tryOpenAiFallback(payload);
    if (openaiImage) {
      return new NextResponse(new Uint8Array(openaiImage), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="infografia-${randomUUID()}.png"`,
          "x-infographic-source": "openai",
        },
      });
    }
  } catch {
    // Return explicit failure below.
  }

  return NextResponse.json(
    {
      error:
        "No fue posible generar la infografia: NotebookLM no disponible y fallaron los fallbacks.",
    },
    { status: 500 }
  );
}
