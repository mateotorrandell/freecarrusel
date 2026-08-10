import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import crypto from "crypto";
import path from "path";
import crossSpawn from "cross-spawn";
import { getClaudePath, isClaudeAvailable } from "@/lib/claude-path";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand } from "@/lib/brand";
import { getCarousel } from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isClaudeAvailable()) {
    return NextResponse.json(
      {
        error:
          "Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code or set CLAUDE_CLI_PATH in .env.local",
      },
      { status: 503 }
    );
  }

  let body: {
    message?: string;
    sessionId?: string;
    carouselId?: string;
    stylePresetId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, sessionId, carouselId, stylePresetId } = body;

  if (
    !message ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 10000
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Build dynamic system prompt with current brand + carousel + style preset context
  const brand = await getBrand();
  const carousel = carouselId ? await getCarousel(carouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const { language } = await getSettings();
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset, language);

  const claudePath = getClaudePath();
  const abortController = new AbortController();

  // Neutral working directory: keeps the subprocess from picking up any CLAUDE.md
  // in the project tree. Slides are written through the HTTP API, never the fs,
  // so the agent has no need for the repo root.
  // Deliberately NOT a dotted directory: permission globs like
  // `Write(**/.agent-cwd/**)` don't match hidden folders, which silently
  // denied the agent write access to its own workspace.
  const agentCwd = path.join(process.cwd(), "data", "agent-workspace");
  mkdirSync(agentCwd, { recursive: true });

  // The system prompt goes to a file, not an argv entry. On Windows the CLI is a
  // .cmd shim, so argv passes through cmd.exe and its 8191-char limit — a prompt
  // carrying brand config, the slide list and absolute reference-image paths blows
  // past that and the spawn dies with "command line is too long".
  const promptFile = path.join(agentCwd, `system-prompt-${crypto.randomUUID()}.md`);
  writeFileSync(promptFile, systemPrompt, "utf-8");

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--append-system-prompt-file",
    promptFile,
    "--allowedTools",
    "Bash",
    "--allowedTools",
    "WebFetch",
    "--allowedTools",
    "Read",
    // Isolate the agent from the host's Claude Code config. Without this it loads
    // this repo's CLAUDE.md (an architecture doc that tells it to edit source files)
    // plus the user's global CLAUDE.md/settings, and behaves like a dev agent
    // working on the codebase instead of the carousel design engine.
    "--setting-sources",
    "local",
    // Isolating the settings above also drops the host's permission allowlist, so
    // the agent can no longer run curl and stalls waiting for an approval it can't
    // request in -p mode. Grant that one capability back explicitly.
    "--settings",
    path.join(process.cwd(), "data", ".agent-settings.json"),
    // The agent runs from a neutral cwd (see spawn below), so grant explicit read
    // access to the uploads dir for reference images.
    "--add-dir",
    path.join(process.cwd(), "public", "uploads"),
    // A URL job (fetch the site, download assets, build several carousels) is
    // far heavier than a single-carousel request, so the ceiling has room.
    "--max-budget-usd",
    "8.00",
    "--name",
    "carrusel-chat",
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let childProcess: ReturnType<typeof spawn>;

      const isWindowsShim =
        process.platform === "win32" && /\.(cmd|bat)$/i.test(claudePath);
      const spawner = isWindowsShim ? crossSpawn : spawn;

      try {
        childProcess = spawner(claudePath, args, {
          cwd: agentCwd,
          signal: abortController.signal,
          stdio: ["pipe", "pipe", "pipe"],
        });
        // The user message goes over stdin for the same reason as the system
        // prompt: it can be up to 10k chars, which alone can exceed the Windows
        // argv limit once combined with the rest of the flags.
        childProcess.stdin?.write(message);
        childProcess.stdin?.end();
      } catch (err) {
        // The exit handler never runs when spawn itself throws, so drop the
        // prompt file here too.
        rmSync(promptFile, { force: true });
        const e = err as NodeJS.ErrnoException;
        console.error("[chat] failed to spawn Claude CLI", {
          claudePath,
          platform: process.platform,
          code: e?.code,
          message: e?.message,
        });
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: "Failed to start Claude CLI",
              code: e?.code,
              path: claudePath,
              message: e?.message,
            })}\n\n`
          )
        );
        controller.close();
        return;
      }

      let buffer = "";
      let resolvedSessionId = sessionId ?? "";

      childProcess.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event, controller, encoder, (id) => {
              resolvedSessionId = id;
            });
          } catch {
            // skip unparseable lines
          }
        }
      });

      let stderrBuf = "";
      const STDERR_CAP = 8192;
      childProcess.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < STDERR_CAP) {
          stderrBuf = (stderrBuf + chunk.toString()).slice(-STDERR_CAP);
        }
      });

      // Timeout: kill subprocess after 8 minutes (autonomous mode creates many slides)
      const timeout = setTimeout(() => {
        childProcess.kill();
      }, 480_000);

      childProcess.on("error", (err) => {
        clearTimeout(timeout);
        const e = err as NodeJS.ErrnoException;
        console.error("[chat] Claude subprocess error", {
          claudePath,
          platform: process.platform,
          code: e?.code,
          syscall: e?.syscall,
          path: e?.path,
          message: e?.message,
          stderr: stderrBuf,
        });
        try {
          childProcess.kill();
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: err.message,
                code: e?.code,
                syscall: e?.syscall,
                path: e?.path,
                stderr: stderrBuf || undefined,
              })}\n\n`
            )
          );
          controller.close();
        } catch {
          // stream already closed
        }
      });

      childProcess.on("exit", (code) => {
        clearTimeout(timeout);
        rmSync(promptFile, { force: true });
        // process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            handleEvent(event, controller, encoder, (id) => {
              resolvedSessionId = id;
            });
          } catch {
            // skip
          }
        }

        if (code && code !== 0) {
          console.error("[chat] Claude subprocess exited non-zero", {
            claudePath,
            platform: process.platform,
            exitCode: code,
            stderr: stderrBuf,
          });
          try {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: `Claude CLI exited with code ${code}`,
                  exitCode: code,
                  stderr: stderrBuf || undefined,
                })}\n\n`
              )
            );
          } catch {
            // stream already closed
          }
        }

        try {
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                sessionId: resolvedSessionId,
                exitCode: code,
              })}\n\n`
            )
          );
          controller.close();
        } catch {
          // stream already closed
        }
      });
    },

    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function handleEvent(
  event: Record<string, unknown>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  onSessionId: (id: string) => void
) {
  // Extract session ID from init event
  if (
    event.type === "system" &&
    event.subtype === "init" &&
    event.session_id
  ) {
    onSessionId(event.session_id as string);
    return;
  }

  // Extract streaming text tokens
  if (event.type === "assistant" && event.message) {
    const msg = event.message as Record<string, unknown>;
    if (msg.type === "message" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "token", text: b.text })}\n\n`
            )
          );
        }
      }
    }
    return;
  }

  // Extract result with session ID
  if (event.type === "result") {
    if (event.session_id) {
      onSessionId(event.session_id as string);
    }
    if (typeof event.result === "string" && event.result) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "result", text: event.result })}\n\n`
        )
      );
    }
    return;
  }
}
