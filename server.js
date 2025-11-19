// server.js

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const {
  PORT = 3000,
  WXCC_TOKEN_URL,
  WXCC_CLIENT_ID,
  WXCC_CLIENT_SECRET,
  WXCC_BASE_URL,
  WXCC_ORG_ID
} = process.env;

// Serve static web component at /static/cherry-picker.js
app.use("/static", express.static(path.join(__dirname, "public")));

// Optional. store metadata sent from Flow Designer
const flowEventStore = new Map();

// OAuth token cache
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

async function wxccRequest(method, urlPath, options = {}) {
  const token = await getAccessToken();

  try {
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
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("[WxCC API error]", {
      method,
      url: `${WXCC_BASE_URL}${urlPath}`,
      status,
      data
    });
    throw err;
  }
}

// Flow Designer hook, optional but useful
app.post("/api/flow-events", (req, res) => {
  const { taskId, interactionId, callerId, queueId, extra } = req.body;

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

app.get("/api/tasks/queue", async (req, res) => {
  try {
    const { queueId } = req.query;
    if (!queueId) {
      return res.status(400).json({ error: "queueId is required" });
    }

    // Last 15 minutes in epoch milliseconds
    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Match DevNet examples. orgId, channelTypes, from, to
    const params = {
      orgId: WXCC_ORG_ID,
      channelTypes: "telephony",      // plural, per Cisco sample:contentReference[oaicite:1]{index=1}
      from: fifteenMinutesAgo,
      to: now
    };

    console.log("[/api/tasks/queue] Calling Get Tasks with params:", params);

    const data = await wxccRequest("get", "/tasks", { params });

    const rawTasks = data.tasks || data.items || data || [];
    console.log("[/api/tasks/queue] Raw tasks count:", rawTasks.length);

    // Filter locally to our queue and queued state
    const filtered = rawTasks.filter((t) => {
      const state = (t.state || t.status || "").toUpperCase();
      const qId = t.queueId || t.queueName || t.queue || "";
      const matchesQueue =
        !queueId || qId.toLowerCase() === queueId.toLowerCase();
      const isQueued = state === "QUEUED" || state === "IN_QUEUE";
      return matchesQueue && isQueued;
    });

    const tasks = filtered.map((t) => {
      const id = t.id || t.taskId;
      const flowMeta = id ? flowEventStore.get(id) || {} : {};

      return {
        id,
        interactionId: t.interactionId || t.interactionIdRef,
        queueId: t.queueId || queueId,
        channelType: t.channelType || t.channel || "telephony",
        createdTime: t.createdTime || t.createdAt,
        ani: t.ani || t.fromAddress || t.callerId || null,
        dnis: t.dnis || t.toAddress || null,
        state: t.state || t.status,
        callerId: flowMeta.callerId || t.ani || null,
        waitTimeSeconds: t.waitTimeSeconds || null
      };
    });

    console.log("[/api/tasks/queue] Filtered tasks count:", tasks.length);

    res.json({ tasks });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error("[/api/tasks/queue] error", status, details);

    res.status(500).json({
      error: "Failed to fetch queue tasks from WxCC",
      status,
      details
    });
  }
});

// Assign one task to the requesting agent
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
      deviceId: deviceId || undefined
    };

    const data = await wxccRequest(
      "post",
      `/tasks/${encodeURIComponent(taskId)}/assign`,
      { data: body }
    );

    res.json({ ok: true, result: data });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error("[/api/tasks/:taskId/assign] error", status, details);

    res.status(500).json({
      error: "Failed to assign task in WxCC",
      status,
      details
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Cherry Picker backend healthy" });
});

app.get("/", (req, res) => {
  res.send("WxCC Cherry Picker backend, live queue only.");
});

app.listen(PORT, () => {
  console.log(`WxCC Cherry Picker backend listening on port ${PORT}`);
});
