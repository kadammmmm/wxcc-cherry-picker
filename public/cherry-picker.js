class WxccCherryPicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.agentId = "";
    this.orgId = "";
    this.queueId = "";
    this.apiBase = "";

    this.state = {
      queueTasks: [],
      historyTasks: [],
      error: null,
      loading: false,
    };
  }

  connectedCallback() {
    // Attributes from layout
    const attrAgentId = this.getAttribute("agent-id");
    const attrOrgId = this.getAttribute("org-id");
    const attrQueueId = this.getAttribute("queue-id");
    const attrApiBase = this.getAttribute("api-base");

    // Properties from layout (Desktop might set these on the element)
    const propAgentId = this.agentId;
    const propOrgId = this.orgId;
    const propQueueId = this.queueId;
    const propApiBase = this.apiBase;

    // Resolve values, preferring properties, then attributes, then defaults
    this.agentId = propAgentId || attrAgentId || "unknown-agent";
    this.orgId = propOrgId || attrOrgId || "unknown-org";
    this.queueId = propQueueId || attrQueueId || "Matt_Voice";

    // IMPORTANT. hardcoded fallback to Render backend
    this.apiBase =
      propApiBase ||
      attrApiBase ||
      "https://wxcc-cherry-picker.onrender.com/api";

    console.log("[CherryPicker] Resolved values:", {
      attrAgentId,
      attrOrgId,
      attrQueueId,
      attrApiBase,
      propAgentId,
      propOrgId,
      propQueueId,
      propApiBase,
      apiBase: this.apiBase,
    });

    this.render();
    this.loadData();
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  async loadData() {
    try {
      this.setState({ loading: true, error: null });

      const queueUrl = `${this.apiBase}/tasks/queue?queueId=${encodeURIComponent(
        this.queueId
      )}`;
      const historyUrl = `${this.apiBase}/tasks/history?hours=24&queueId=${encodeURIComponent(
        this.queueId
      )}`;

      console.log("[CherryPicker] Fetching:", { queueUrl, historyUrl });

      const [queueResp, historyResp] = await Promise.all([
        fetch(queueUrl, { credentials: "include" }),
        fetch(historyUrl, { credentials: "include" }),
      ]);

      // Read as text first so we can see if it is HTML
      const queueText = await queueResp.text();
      const historyText = await historyResp.text();

      console.log("[CherryPicker] Queue response snippet:", {
        status: queueResp.status,
        bodyStart: queueText.slice(0, 200),
      });
      console.log("[CherryPicker] History response snippet:", {
        status: historyResp.status,
        bodyStart: historyText.slice(0, 200),
      });

      if (!queueResp.ok) {
        throw new Error(`Queue API error ${queueResp.status}`);
      }
      if (!historyResp.ok) {
        throw new Error(`History API error ${historyResp.status}`);
      }

      let queueData;
      let historyData;
      try {
        queueData = JSON.parse(queueText);
        historyData = JSON.parse(historyText);
      } catch (e) {
        console.error("[CherryPicker] JSON parse error", e);
        throw new Error(
          "Backend did not return valid JSON. see console for raw response"
        );
      }

      this.setState({
        queueTasks: queueData.tasks || [],
        historyTasks: historyData.tasks || [],
        loading: false,
      });
    } catch (err) {
      console.error("Failed to load data", err);
      this.setState({
        loading: false,
        error: "Failed to load tasks from backend",
      });
    }
  }

  async claimTask(taskId) {
    try {
      const url = `${this.apiBase}/tasks/assign`;
      console.log("[CherryPicker] Claiming task", { url, taskId });

      const resp = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId,
          agentId: this.agentId,
          orgId: this.orgId,
        }),
      });

      const text = await resp.text();
      console.log("[CherryPicker] Assign response snippet:", {
        status: resp.status,
        bodyStart: text.slice(0, 200),
      });

      if (!resp.ok) {
        throw new Error(`Assign failed ${resp.status}`);
      }

      // Reparse as JSON in case you want to use the payload
      const data = text ? JSON.parse(text) : {};
      console.log("[CherryPicker] Assign parsed data", data);

      this.loadData();
    } catch (err) {
      console.error("Failed to assign task", err);
      alert("Failed to assign task. check console logs for details");
    }
  }

  render() {
    const { queueTasks, historyTasks, error, loading } = this.state;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: Arial, sans-serif;
          display: block;
          height: 100%;
          box-sizing: border-box;
          padding: 8px;
        }
        h2 {
          margin: 0 0 8px 0;
          font-size: 18px;
        }
        .header {
          font-size: 12px;
          margin-bottom: 8px;
          color: #555;
        }
        .section-title {
          font-weight: bold;
          margin-top: 12px;
          margin-bottom: 4px;
        }
        .error {
          color: #b00020;
          margin: 8px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 4px 6px;
          text-align: left;
        }
        th {
          background: #f4f4f4;
        }
        button {
          font-size: 11px;
          padding: 2px 6px;
          cursor: pointer;
        }
        .loading {
          font-size: 12px;
          color: #777;
        }
      </style>
      <div>
        <h2>WxCC Cherry Picker</h2>
        <div class="header">
          Agent: ${this.agentId}  |  Queue: ${this.queueId}
        </div>
        ${loading ? `<div class="loading">Loading...</div>` : ""}
        ${error ? `<div class="error">${error}</div>` : ""}
        <div class="section-title">Calls in Queue</div>
        ${queueTasks.length === 0
          ? "<div>No tasks in queue</div>"
          : `
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>ANI</th>
                <th>Waiting (s)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${queueTasks
                .map(
                  (t) => `
                <tr>
                  <td>${t.id || t.taskId || ""}</td>
                  <td>${t.ani || t.callerId || ""}</td>
                  <td>${t.waitTimeSeconds ?? ""}</td>
                  <td>
                    <button data-task-id="${
                      t.id || t.taskId || ""
                    }">Claim</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `}
        <div class="section-title">Last 24 hours</div>
        ${historyTasks.length === 0
          ? "<div>No history</div>"
          : `
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>ANI</th>
                <th>Result</th>
                <th>Ended</th>
              </tr>
            </thead>
            <tbody>
              ${historyTasks
                .map(
                  (t) => `
                <tr>
                  <td>${t.id || t.taskId || ""}</td>
                  <td>${t.ani || t.callerId || ""}</td>
                  <td>${t.outcome || t.state || ""}</td>
                  <td>${t.endedAt || ""}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        `}
      </div>
    `;

    // Wire Claim buttons
    this.shadowRoot.querySelectorAll("button[data-task-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const taskId = btn.getAttribute("data-task-id");
        if (taskId) {
          this.claimTask(taskId);
        }
      });
    });
  }
}

customElements.define("wxcc-cherry-picker", WxccCherryPicker);
