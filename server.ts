import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { initDB, getProjects, createProject, getProject, getMessages } from "./src/server/db";
import { Orchestrator } from "./src/server/orchestrator";

async function startServer() {
  // Initialize Database
  await initDB();
  console.log("SQLite Database initialized.");

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await getProjects();
      res.json(projects);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { name, goal } = req.body;
      const project = await createProject(name, goal);
      res.json(project);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Not found" });
      res.json(project);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id/messages", async (req, res) => {
    try {
      const messages = await getMessages(req.params.id);
      res.json(messages);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // SSE Endpoint for the Agent Loop
  app.post("/api/projects/:id/chat", async (req, res) => {
    const { prompt } = req.body;
    const projectId = req.params.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (type: string, data: any) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const orchestrator = new Orchestrator(projectId, sendEvent);
      await orchestrator.runLoop(prompt);
      res.end();
    } catch (error: any) {
      console.error("Agent Error:", error);
      sendEvent("error", { message: error.message });
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
