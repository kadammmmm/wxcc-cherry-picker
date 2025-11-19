// public/cherry-picker.js

class WxccCherryPicker extends HTMLElement {
  static get observedAttributes() {
    return ["agent-id", "org-id", "queue-id"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.agentId = "";
    this.orgId = "";
    this.queueId = "";
    this.refreshInterval = null;

    this.apiBase = this.getAttribute("api-base") || "/api";

    this._onClaimClick = this._onClaimClick.bind(this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === "agent-id") this.agentId = newValue;
    if (name === "org-id") this.orgId = newValue;
    if (name === "queue-id") this.queueId = newValue;

    if (name === "queue-id" && this.isConnected) {
      this.loadData();
    }
  }

  connectedCallback() {
    this.render();
    this.loadData();
    this.refreshInterval = setInterval(() => this.loadData(), 10_000);
  }

  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async loadData() {
    if (!this.queueId) return;

    try {
      const [queueResp, historyResp] = await Promise.all([
        fetch(`${this.apiBase}/tasks/queue?queueId=${encodeURIComponent(this.queueId)}`),
        fetch(`${this.apiBase}/tasks/history`)
      ]);

      const queueData = await queueResp.json();
      const historyData = await historyResp.json();

      this.renderTables(queueData.tasks || [], historyData.tasks || []);
    } catch (e) {
      console.error("Failed to load data", e);
      this.renderError("Failed to load tasks from backend");
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          color: #222;
          box-sizing: border-box;
          padding: 8px;
        }

        h2 {
          margin: 0 0 4px 0;
          font-size: 14px;
        }

        h3 {
          margin: 12px 0 4px 0;
          font-size: 13px;
        }

        .meta {
          font-size: 11px;
          color: #555;
          margin-bottom: 8px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
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

        .actions {
          text-align: center;
        }

        button {
          padding: 2px 8px;
          font-size: 11px;
          border-radius: 3px;
          border: 1px solid #0b5fff;
          background: #0b5fff;
          color: white;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .error {
          color: #a00;
          font-size: 11px;
        }

        .empty {
          font-size: 11px;
          color: #666;
          font-style: italic;
        }
      </style>

      <div>
        <h2>WxCC Cherry Picker</h2>
        <div class="meta">
          Agent: <span id="agentId"></span>
          &nbsp;|&nbsp;
          Queue: <span id="queueId"></span>
        </div>

        <h3>Calls in Queue</h3>
        <div id="queueContainer"></div>

        <h3>Last 24 hours</h3>
        <div id="historyContainer"></div>

        <div id="error" class="error"></div>
      </div>
    `;

    this.shadowRoot.getElementById("agentId").textContent = this.agentId || "(unknown)";
    this.shadowRoot.getElementById("queueId").textContent = this.queueId || "(not set)";
  }

  renderError(msg) {
    const el = this.shadowRoot.getElementById("error");
    if (!el) return;
    el.textContent = msg || "";
  }

  renderTables(queueTasks, historyTasks) {
    this.renderError("");

    const queueContainer = this.shadowRoot.getElementById("queueContainer");
    const historyContainer = this.shadowRoot.getElementById("historyContainer");

    queueContainer.innerHTML = "";
    historyContainer.innerHTML = "";

    if (!queueTasks.length) {
      queueContainer.innerHTML = `<div class="empty">No tasks currently in queue.</div>`;
    } else {
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Caller ID</th>
            <th>ANI</th>
            <th>DNIS</th>
            <th>Queue</th>
            <th>Created</th>
            <th class="actions">Action</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");

      queueTasks.forEach((t) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td title="${t.id}">${t.id}</td>
          <td>${t.callerId || ""}</td>
          <td>${t.ani || ""}</td>
          <td>${t.dnis || ""}</td>
          <td>${t.queueId || ""}</td>
          <td>${t.createdTime || ""}</td>
          <td class="actions">
            <button data-task-id="${t.id}">Claim</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      table.addEventListener("click", this._onClaimClick);
      queueContainer.appendChild(table);
    }

    if (!historyTasks.length) {
      historyContainer.innerHTML = `<div class="empty">No tasks in last 24 hours.</div>`;
    } else {
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Caller ID</th>
            <th>ANI</th>
            <th>DNIS</th>
            <th>Queue</th>
            <th>Started</th>
            <th>Ended</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");

      historyTasks.forEach((t) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td title="${t.id}">${t.id}</td>
          <td>${t.callerId || ""}</td>
          <td>${t.ani || ""}</td>
          <td>${t.dnis || ""}</td>
          <td>${t.queueId || ""}</td>
          <td>${t.createdTime || ""}</td>
          <td>${t.endTime || ""}</td>
        `;
        tbody.appendChild(tr);
      });

      historyContainer.appendChild(table);
    }

    // Update labels
    this.shadowRoot.getElementById("agentId").textContent = this.agentId || "(unknown)";
    this.shadowRoot.getElementById("queueId").textContent = this.queueId || "(not set)";
  }

  async _onClaimClick(event) {
    if (event.target.tagName !== "BUTTON") return;

    const taskId = event.target.getAttribute("data-task-id");
    if (!taskId || !this.agentId) {
      this.renderError("Missing taskId or agentId");
      return;
    }

    event.target.disabled = true;
    event.target.textContent = "Claiming...";

    try {
      const resp = await fetch(`${this.apiBase}/tasks/${encodeURIComponent(taskId)}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agentId: this.agentId
          // You can add deviceId here if needed
        })
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Assign failed");
      }

      // Refresh the tables after successful assign
      this.loadData();
    } catch (e) {
      console.error("Assign failed", e);
      this.renderError(`Failed to assign task: ${e.message}`);
      event.target.disabled = false;
      event.target.textContent = "Claim";
    }
  }
}

customElements.define("wxcc-cherry-picker", WxccCherryPicker);
