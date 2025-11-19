app.get("/api/tasks/queue", async (req, res) => {
  try {
    const { queueId } = req.query;
    if (!queueId) {
      return res.status(400).json({ error: "queueId is required" });
    }

    // last 15 minutes of activity should be enough to see queued calls
    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    // Minimal, spec-aligned params for Get Tasks
    const params = {
      orgId: WXCC_ORG_ID,
      channelType: "telephony",          // as per docs
      fromDateTime: fifteenMinutesAgo,   // epoch ms
      toDateTime: now                    // epoch ms
    };

    console.log("[/api/tasks/queue] Calling Get Tasks with params:", params);

    const data = await wxccRequest("get", "/tasks", { params });

    // Be defensive about response shape
    const rawTasks = data.tasks || data.items || data || [];
    console.log("[/api/tasks/queue] Raw tasks count:", rawTasks.length);

    // Filter in Node for just OUR queue + queued state
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
