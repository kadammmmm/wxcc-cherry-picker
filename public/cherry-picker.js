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
      loading: false,
      error: null
    };

    this.refreshInterval = null;
  }

  connectedCallback() {
    // Get attributes from layout
    const attrAgentId = this.getAttribute("agent-id");
    const attrOrgId = this.getAttribute("org-id");
    const attrQueueId = this.getAttribute("queue-id");
    const attrApiBase = this.getAttribute("api-base");

    // Resolve values, with safe defaults
    this.agentId = attrAgentId || "unknown-agent";
    this.orgId = attrOrgId || "unknown-org";
    this.queueId = attrQueueId || "default-queue";

    // Fallback apiBase to Render if not provided
    this.apiBase =
      attrApiBase || "https://wxcc-cherry-picker.onrender.com/api";

    console.log("[CherryPicker] init", {
      agentId: this.agentId,
      orgId: this.orgId,
      queueId: this.queueId,
      apiBase: this.apiBase
    });

    this.render();
    this.loadQueue();

    // auto refresh every 10 seconds
    this.refreshInterval = setInterval(() => this.loadQueue(), 10_000);
  }

  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  async loadQueue() {
    try {
      this.setState({ loading: true, error: null });

      const url = `${this.apiBase}/tasks/queue?queueId=${encodeURIComponent(
        this.queueId
      )}`;
      console.log("[CherryPicker] fetch queue", url);

      const resp = await fetch(url);
      const text = await resp.text();

      console.log("[CherryPicker] queue resp snippet", {
        status: resp.status,
        bodyStart: text.slice(0, 200)
      });

      if (!resp.ok) {
        throw new Error(`Queue API error ${resp.status}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[CherryPicker] queue JSON parse error", e);
        throw new Error(
          "Backend did not return valid JSON for queue. see console"
        );
      }

      this.setState({
        queueTasks: data.tasks || [],
        loading: false
      });
    } catch (err) {
      console.error("[CherryPicker] loadQueue error", err);
      this.setState({
        loading: false,
        error: err.message || "Failed to load queue"
      });
    }
  }

  async claimTask(taskId) {
    if (!taskId) return;
    if (!this.agentId || this.agentId === "unknown-agent") {
      alert("Missing agentId, cannot claim task");
      return;
    }

    try {
      const url = `${this.apiBase}/tasks/${encodeURIComponent(
        taskId
      )}/assign`;
      console.log("[CherryPicker] assign", { url, taskId, agentId: this.agentId });

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: this.agentId,
          orgId: this.orgId
        })
      });

      const text = await resp.text();
      console.log("[CherryPicker] assign resp snippet", {
        status: resp.status,
        bodyStart: text.slice(0, 200)
      });

      if (!resp.ok) {
        throw new Error(`Assign API error ${resp.status}`);
      }

      // optional parse of JSON
      // const data = text ? JSON.parse(text) : {};
      // console.log("[CherryPicker] assign data", data);

      // refresh queue after success
      this.loadQueue();
    } catch (err) {
      console.error("[CherryPicker] claimTask error", err);
      alert("Failed to assign task, see console for details");
    }
  }

  render() {
    const { queueTasks, loading, error } = this.state;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          color: #222;
          box-sizing: border-box;
          height: 100%;
          padding: 8px;
        }
        h2 {
          margin: 0 0 4px 0;
          font-size: 16px;
        }
        .header {
          font-size: 11px;
          color: #555;
          margin-bottom: 8px;
        }
        .error {
          color: #b00020;
          margin: 4px 0;
        }
        .loading {
          font-size: 11px;
          color: #777;
          margin-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 4px 6px;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        th {
          background: #f3f3f3;
          font-weight: 600;
        }
        button {
          padding: 2px 8px;
          font-size: 11px;
          border-radius: 3px;
          border: 1px solid #0b5fff;
          background: #0b5fff;
          color: #fff;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: default;
        }
      </style>
      <div>
        <h2>WxCC Cherry Picker</h2>
        <div class="header">
          Agent: ${this.agentId}  |  Queue: ${this.queueId}
        </div>
        ${loading ? `<div class="loading">Loading queue...</div>` : ""}
        ${error ? `<div class="error">${error}</div>` : ""}
        ${
          queueTasks.length === 0 && !loading
            ? `<div>No tasks currently in queue</div>`
            : `
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Caller ID</th>
                <th>ANI</th>
                <th>DNIS</th>
                <th>State</th>
                <th>Wait (s)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${queueTasks
                .map((t) => {
                  const id = t.id || t.taskId || "";
                  const caller = t.callerId || t.ani || "";
                  const ani = t.ani || "";
                  const dnis = t.dnis || "";
                  const state = t.state || "";
                  const wait = t.waitTimeSeconds ?? "";
                  return `
                    <tr>
                      <td title="${id}">${id}</td>
                      <td>${caller}</td>
                      <td>${ani}</td>
                      <td>${dnis}</td>
                      <td>${state}</td>
                      <td>${wait}</td>
                      <td>
                        <button data-task-id="${id}">Claim</button>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        `
        }
      </div>
    `;

    this.shadowRoot
      .querySelectorAll("button[data-task-id]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const taskId = btn.getAttribute("data-task-id");
          this.claimTask(taskId);
        });
      });
  }
}

customElements.define("wxcc-cherry-picker", WxccCherryPicker);
