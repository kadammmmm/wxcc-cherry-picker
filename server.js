// server.js
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend bundle (web component) from /public
app.use("/static", express.static(path.join(__dirname, "public")));

const {
  PORT = 3000,
  WXCC_TOKEN_URL,
  WXCC_CLIENT_ID,
  WXCC_CLIENT_SECRET,
  WXCC_BASE_URL,
  WXCC_ORG_ID
} = process.env;

// Very simple in memory store for Flow Designer events
// key: taskId  value: metadata from Flow Designer
const flowEventStore = new Map();

// Cache OAuth token
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", WXCC_CLIENT_ID);
  params.append("client_secret", WXCC_CLIENT_SECRET);

  const resp = await axios.post(WXCC_TOKEN_URL, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  cachedToken = resp.data.access_token;
  tokenExpiry = now + resp.data.expires_in * 1000;

  return cachedToken;
}

/**
 * Utility for calling WxCC APIs
 */
async function wxccRequest(method, urlPath, options = {}) {
  const token = await getAccessToken();

  const resp = await axios({
    method,
    url: `${WXCC_BASE_URL}${urlPath}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    params: options.params,
    data: options.data
  });

  return resp.data;
}

/**
 * Flow Designer will call this before queuing.
 * Store ANI, queueId, and anything else keyed by taskId.
 */
app.post("/api/flow-events", (req, res) => {
  const {
    taskId,
    interactionId,
    callerId,
    queueId,
    extra
  } = req.body;

  if (!taskId) {
    return res.status(400).json({ error: "taskId is required" });
  }

  flowEventStore.set(taskId, {
    interactionId: interactionId || null,
    callerId: callerId || null,
    queueId: queueId || null,
    extra: extra || null,
    receivedAt: new Date().toISOString()
  });

  res.json({ ok: true });
});

/**
 * Get tasks currently in a given queue.
 * This uses the WxCC Get Tasks data API.
 *
 * Important.
 * Check your developer docs for the exact query parameters.
 * The example assumes:
 *   GET /tasks?orgId=...&queueId=...&state=queued
 */
app.get("/api/tasks/queue", async (req, res) => {
  try {
    const { queueId } = req.query;
    if (!queueId) {
      return res.status(400).json({ error: "queueId is required" });
    }

    const params = {
      orgId: WXCC_ORG_ID,
      // Adjust param names to match reference docs
      queueId,
      state: "queued"
    };

    const data = await wxccRequest("get", "/tasks", { params });

    // Assume data.tasks is the array, adjust if needed
    const tasks = (data.tasks || []).map((t) => {
      const flowMeta = flowEventStore.get(t.id) || {};
      return {
        id: t.id,
        interactionId: t.interactionId,
        queueId: t.queueId,
        channelType: t.channelType,
        createdTime: t.createdTime,
        // These fields are often on the interaction or task data model
        ani: t.ani || t.fromAddress || null,
        dnis: t.dnis || t.toAddress || null,
        // Flow metadata enrichment
        callerId: flowMeta.callerId || t.ani || null,
        flowMeta
      };
    });

    res.json({ tasks });
  } catch (err) {
    console.error("Error in /api/tasks/queue", err.response?.data || err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

/**
 * Get last 24h worth of tasks for history.
 *
 * Example assumes:
 *   GET /tasks?orgId=...&fromTime=...&toTime=...&states=...
 * Adjust param names to match your Get Tasks reference.
 */
app.get("/api/tasks/history", async (req, res) => {
  try {
    const now = Date.now();
    const from = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now).toISOString();

    const params = {
      orgId: WXCC_ORG_ID,
      fromTime: from,
      toTime: to,
      // Completed states for history. Adjust to your data model
      states: "completed,abandoned,terminated"
    };

    const data = await wxccRequest("get", "/tasks", { params });

    const tasks = (data.tasks || []).map((t) => {
      const flowMeta = flowEventStore.get(t.id) || {};
      return {
        id: t.id,
        interactionId: t.interactionId,
        queueId: t.queueId,
        channelType: t.channelType,
        createdTime: t.createdTime,
        endTime: t.endTime,
        ani: t.ani || t.fromAddress || null,
        dnis: t.dnis || t.toAddress || null,
        callerId: flowMeta.callerId || t.ani || null,
        flowMeta
      };
    });

    res.json({ tasks });
  } catch (err) {
    console.error("Error in /api/tasks/history", err.response?.data || err);
    res.status(500).json({ error: "Failed to fetch history tasks" });
  }
});

/**
 * Assign task to an agent.
 *
 * Example assumes Task Control endpoint is:
 *   POST /tasks/{taskId}/assign
 * with body including orgId and agentId.
 * Check Tasks Call Control reference to confirm field names.:contentReference[oaicite:6]{index=6}
 */
app.post("/api/tasks/:taskId/assign", async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId, deviceId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    const body = {
      orgId: WXCC_ORG_ID,
      agentId,
      // Optional. For example, DEV or DN if required by your tenant
      deviceId: deviceId || undefined
    };

    const result = await wxccRequest("post", `/tasks/${taskId}/assign`, {
      data: body
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.error("Error in /api/tasks/:taskId/assign", err.response?.data || err);
    res.status(500).json({ error: "Failed to assign task" });
  }
});

app.get("/", (req, res) => {
  res.send("WxCC Cherry Picker backend is running.");
});

app.listen(PORT, () => {
  console.log(`WxCC Cherry Picker backend on port ${PORT}`);
});
