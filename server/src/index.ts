import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSchema } from "./db.js";
import { loadSession } from "./session.js";
import authRoutes from "./routes/auth.js";
import documentsRoutes from "./routes/documents.js";

const app = express();
const PORT = process.env.PORT ?? 8787;
const DEV_ORIGIN = process.env.DEV_CLIENT_ORIGIN;

app.use(express.json());
app.use(cookieParser());

// Only needed in local dev, where the Vite dev server (5173) and this API
// (8787) are different origins. In production the built frontend is served
// from this same process/origin, so no cross-origin requests happen at all.
if (DEV_ORIGIN) {
  app.use(cors({ origin: DEV_ORIGIN, credentials: true }));
}

app.use(loadSession);

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);

if (process.env.NODE_ENV === "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.join(here, "../../web/dist");
  app.use(express.static(staticDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Private Writer server listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
