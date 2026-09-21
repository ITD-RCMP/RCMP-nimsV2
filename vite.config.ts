import { execSync } from "node:child_process";
import path from "path";
import { pathToFileURL } from "url";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function devClientErrorLogger() {
  const VIRTUAL_ID = "virtual:dev-client-error-handler";
  const RESOLVED_ID = "\0" + VIRTUAL_ID;

  return {
    name: "dev-client-error-logger",
    apply: "serve" as const,
    enforce: "pre" as const,

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id: string) {
      if (id !== RESOLVED_ID) return;
      return [
        "if (typeof window !== 'undefined' && import.meta.hot) {",
        "  const send = (d) => { try { import.meta.hot.send('client-runtime-error', d) } catch {} };",
        "  window.addEventListener('error', (e) => {",
        "    send({ type: 'runtime-error', message: e.message, stack: e.error?.stack, filename: e.filename, lineno: e.lineno, colno: e.colno });",
        "  });",
        "  window.addEventListener('unhandledrejection', (e) => {",
        "    const err = e.reason;",
        "    send({ type: 'unhandled-rejection', message: err?.message || String(err), stack: err?.stack });",
        "  });",
        "}",
      ].join("\n");
    },

    configureServer(server: import("vite").ViteDevServer) {
      const origConsoleError = console.error;
      let forwarding = false;
      console.error = (...args: unknown[]) => {
        origConsoleError.apply(console, args);
        if (forwarding) return;
        forwarding = true;
        try {
          const error = args[0];
          if (error instanceof Error) {
            server.ws.send({
              type: "custom",
              event: "client-runtime-error",
              data: {
                source: "ssr",
                type: "ssr-render-error",
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
            });
          }
        } finally {
          forwarding = false;
        }
      };

      server.ws.on(
        "client-runtime-error",
        (data: Record<string, string>) => {
          const { type, message, stack, filename, lineno, colno } = data;
          const label =
            type === "unhandled-rejection"
              ? "Unhandled Rejection"
              : "Runtime Error";
          let loc = "";
          if (filename) {
            loc = ` at ${filename}`;
            if (lineno != null) loc += `:${lineno}`;
            if (colno != null) loc += `:${colno}`;
          }
          server.config.logger.error(
            `\n[client] ${label}: ${message}${loc}`,
          );
          if (stack) {
            server.config.logger.error(stack);
          }

          server.ws.send({
            type: "custom",
            event: "client-runtime-error",
            data,
          });
        },
      );
    },

    transform(code: string, id: string) {
      const normalizedId = id.replace(/\\/g, "/");

      if (normalizedId.includes("routes/__root")) {
        return `import "${VIRTUAL_ID}";\n${code}`;
      }
    },
  };
}

function devServerFnErrorLogger() {
  const HMR_SEND_KEY = "__TANSTACK_SERVER_FN_HMR_SEND__";

  return {
    name: "dev-server-fn-error-logger",
    apply: "serve" as const,
    enforce: "pre" as const,
    configureServer(server: import("vite").ViteDevServer) {
      (globalThis as Record<string, unknown>)[HMR_SEND_KEY] = (data: unknown) => {
        server.ws.send({
          type: "custom",
          event: "server-fn-error",
          data,
        });
      };
    },
    transform(code: string, id: string) {
      const normalizedId = id.replace(/\\/g, "/");
      const isTargetModule =
        normalizedId.includes(
          "/@tanstack/start-server-core/src/server-functions-handler.ts",
        ) ||
        normalizedId.includes(
          "/@tanstack/start-server-core/dist/esm/server-functions-handler.js",
        );

      if (!isTargetModule) {
        return null;
      }

      const needle = "const unwrapped = res.result || res.error";
      if (!code.includes(needle)) {
        return null;
      }

      return code.replace(
        needle,
        `${needle}

      if (res?.error) {
        const err = res.error
        const payload = {
          source: 'tanstack',
          type: 'server-fn-error',
          method: request.method,
          url: request.url,
          name: err?.name ?? 'Error',
          message: err?.message ?? String(err),
          stack: typeof err?.stack === 'string' ? err.stack : undefined,
        }
        globalThis.${HMR_SEND_KEY}?.(payload)
      }`,
      );
    },
  };
}

function overdueReturnEmailSchedulerPlugin() {
  return {
    name: 'overdue-return-email-scheduler',
    apply: 'serve' as const,
    configureServer(server: import('vite').ViteDevServer) {
      if (process.env.OVERDUE_EMAIL_SCHEDULER !== 'true') return;
      const schedulerModule = pathToFileURL(
        path.resolve(process.cwd(), 'backend/server/jobs/overdue-return-email-scheduler.server.ts'),
      ).href;
      void server
        .ssrLoadModule(schedulerModule)
        .then(({ startOverdueReturnEmailScheduler }) => {
          startOverdueReturnEmailScheduler();
        })
        .catch((err) => {
          console.error('[overdue-email] Failed to start scheduler:', err);
        });
    },
  };
}

function readLatestCommitAsSystemUpdate() {
  try {
    const subject = execSync("git log -1 --pretty=%s", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const stripped = subject.replace(
      /^(feat|fix|bug|add|update|chore|docs|refactor|temporary):\s*/i,
      "",
    );
    if (!stripped) return "";
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  // Load VITE_ env vars and define them for SSR
  // Note: loadEnv strips the prefix, so we add it back
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  envDefine["import.meta.env.VITE_SYSTEM_UPDATE"] = JSON.stringify(
    env.VITE_SYSTEM_UPDATE || readLatestCommitAsSystemUpdate(),
  );

  // Server-side OAuth / DB (not exposed to client bundle)
  const serverEnv = loadEnv(mode, process.cwd(), [
    "AZURE_",
    "MYSQL_",
    "SMTP_",
    "CRON_",
    "OVERDUE_",
    "DATABASE_",
    "OPENROUTER_",
    "API_JWT_",
    "SESSION_",
    "ENABLE_DEV_LOGIN",
  ]);
  for (const [key, value] of Object.entries(serverEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: envDefine,
    ssr: {
      external: ['mysql2', 'mysql2/promise', 'nodemailer', 'exceljs', 'better-sqlite3'],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@backend": path.resolve(__dirname, "./backend"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      devClientErrorLogger(),
      devServerFnErrorLogger(),
      overdueReturnEmailSchedulerPlugin(),
      tanstackStart(),
      viteReact(),
      nitro({
        preset: 'node-server',
        plugins: [
          path.resolve(__dirname, 'backend/plugins/overdue-email-scheduler.ts'),
        ],
        rollupConfig: {
          external: ['mysql2', 'mysql2/promise', 'nodemailer', 'better-sqlite3'],
        },
        routeRules: {
          '/**': {
            headers: {
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
              'Referrer-Policy': 'strict-origin-when-cross-origin',
              'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
              'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
            },
          },
        },
      }),
    ],
  };
});
