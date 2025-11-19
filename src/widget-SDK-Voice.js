import { Desktop } from "@wxcc-desktop/sdk";
//import Calling from '@webex/calling';

const template = document.createElement("template");
var loaded = false;

function customLog(msg, args){
  let logName = "cc-widget-logger:"
  if(args){
    console.log(logName+ msg, args);  
  } else {
    console.log(logName, msg);
  }
}

template.innerHTML = `
  <style>

  .loading-icon {
    width: 30px;
    left: 50%;
    position: relative;
    transform: translateX(-50%);
  }

  .button-loading-icon {
    position: relative;
    width: 20px;
    transform: translate(-45px, 5px);
  }

  .invisible {
    visibility: hidden;
  }

  .hidden {
    display:none;
  }

  .result-span {
    text-align:center;
    display:block;
    min-height: 24px;
  }

  .fieldset {
    width: 450px;
    border-radius: 5px;
    max-height:675px;
    overflow:scroll;
  }

  .button{
    display: block;
    border-radius: 5px;
    background: #064157;
    color: white;
    padding: 4px;
    margin-top: 10px;
    width: 100%;
    border: none;
    transition:.3s;
  }

  button:disabled,
  button[disabled]{
    border: 1px solid #999999;
    background-color: #cccccc;
    color: #666666;
  }
  
  input{
    border-top: none;
    border-right: none;
    border-left: none;
    border-color: #DDDDDD;
    border-width: 1.5px;
    color: #005E7D
  }

  *:focus {
    outline: none;
  }

  button:hover:enabled{
    cursor: pointer;
  }

  table {
    margin-top:10px;
  }

  h4 {
    margin:0px;
  }

  p {
    margin:0px;
  }

  .faded {
    color: #888;
  }

  .column-one {
    padding-right: 30px;
  }

  .origin-cell {
    height:30px; /*this keeps our sizing when the claim buttons disappear*/
  }

  .card {
    /* Add shadows to create the "card" effect */
    box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2);
    transform: translateX(-100%); /* Start off-screen to the left */
    opacity: 0;
    transition: transform 0.5s ease-out, opacity 0.5s ease-out;
    /* transition: 0.3s; */
    border-radius: 5px; /* 5px rounded corners */
  }

  .card.animate {
    transform: translateX(0); /* Slide in to its final position */
    opacity: 1;
  }

  /* On mouse-over, add a deeper shadow */
  /* .card:hover {
    box-shadow: 0 8px 16px 0 rgba(0,0,0,0.2);
  } */

  /* Add some padding inside the card container */
  .container {
    padding: 2px 16px;
  }
 
  .flat-rounded-button {
    background-color: #6aeb6a; /* Flat background color */
    color: white; /* Text color */
    border: none; /* Remove default border for a flat look */
    padding: 5px 15px; /* Adjust padding as needed */
    border-radius: 8px; /* Rounded corners */
    font-size: 16px;
    cursor: pointer; /* Indicate interactivity */
    transition: background-color 0.3s ease; /* Smooth transition on hover */
    margin-left: 10px;
  }

  .flat-rounded-button:hover {
    background-color: #59c959; /* Darker background on hover */
  }

  .flat-rounded-button:active {
    background-color: #459945; /* Even darker background on click */
  }

  .checkbox-container {
    display: inline-block;
    margin-right: 15px; /* Adjust spacing as needed */
  }

  </style>

    <div id="mainContainer">
      <div>
        <div id="main-fieldset" class="fieldset">
          <div>
            <img id="loading-icon" src="${process.env.HOST_URI}/img/loading-1.gif" class="loading-icon"/>
            <div id="queue-content" style="display:none;">
              <div class="checkbox-container">
                <input class="checkbox-input" type="checkbox" id="queued" name="queued" value="queued" checked>
                <label for="queued">Queued</label>
              </div>
              <div class="checkbox-container">
                <input class="checkbox-input" type="checkbox" id="assigned" name="assigned" value="assigned" checked>
                <label for="assigned">Assigned</label>
              </div>
              <div class="checkbox-container">
                <input class="checkbox-input" type="checkbox" id="abandoned" name="abandoned" value="abandoned" checked>
                <label for="abandoned">Abandoned</label>
              </div>
              <div class="checkbox-container">
                <input class="checkbox-input" type="checkbox" id="completed" name="completed" value="completed" checked>
                <label for="completed">Completed</label>
              </div>
              <div id="my-queue"></div>
            </div>
            <span id="result-span" class="result-span"></span>
          </div>
        </div>
      </div>
    </div>
`;

//Creating a custom logger
const logger = Desktop.logger.createLogger("cc-widget-logger");

var initResult = false;
var queueTasks = {};
var callerIds = {};
var queueStatuses = ["queued", "assigned", "abandoned", "completed"];

function addOrReplaceEventListener(element, eventName, newListener) {
  // Check if an event listener with the same name already exists
  const hasExistingListener = element.hasOwnProperty(`_${eventName}Listener`);
  if (hasExistingListener) {
    element.removeEventListener(eventName, element[`_${eventName}Listener`]);
  }
  element.addEventListener(eventName, newListener);
  // Store the new listener for future replacement
  element[`_${eventName}Listener`] = newListener;
}

function capitalizeFirstLetter(string) {
  if (typeof string !== 'string' || string.length === 0) {
    return string; // Handle empty strings or non-string inputs
  }
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function makeStringTime(epochTime){
  const millisecondDiff = Date.now() - epochTime;
  const seconds = Math.floor(millisecondDiff / 1000);
  const minutes = Math.round(seconds/60);
  return `${minutes}m`;
}


async function getCallerIds(taskIds){
  customLog("getCallerIds:");
  customLog(taskIds);
  const resp = await fetch(`${process.env.HOST_URI}/callerIds`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      taskIds
    })
  });
  customLog(`getCallerIds.status:${resp.status}`);
  let json = await resp.json();
  customLog(json);
  return json;
}


class myDesktopSDK extends HTMLElement {
  constructor() {
    super();

    const font = document.createElement("link");
    font.href = "https://fonts.googleapis.com/css2?family=Cutive+Mono&family=Darker+Grotesque:wght@300&family=Poppins:wght@200;400&display=swap";
    font.rel = "stylesheet";
    document.head.appendChild(font);

    const cookieSDK = document.createElement("script");
    cookieSDK.src = "https://cdn.jsdelivr.net/npm/js-cookie@2/src/js.cookie.min.js";
    document.head.appendChild(cookieSDK);

    const socketIOSDK = document.createElement("script");
    socketIOSDK.src = `${process.env.HOST_URI}/socket.io.min.js`;
    let self = this;
    socketIOSDK.onload = function(){
        customLog("loaded socket.io.min.js");
        var socket = io(process.env.HOST_URI,{
            withCredentials: true,
              auth: {
                "agentId": Desktop.agentContact.SERVICE.conf.profile.agentId,
                "agentName": Desktop.agentContact.SERVICE.conf.profile.agentName,
                "agentMailId": Desktop.agentContact.SERVICE.conf.profile.agentMailId,
                "orgId": Desktop.agentContact.SERVICE.conf.profile.orgId
              }
          });

          
          socket.on('connect', (msg) => {
            customLog("socket connected!");
          });

          socket.on('disconnect', (msg) => {
            customLog("socket disconnected!");
          });

          socket.on('message', (msg) => {
            customLog("socket message:");
            customLog(msg);
            if(msg.InteractionId){
              callerIds[msg.InteractionId] = msg;
              const convertTask = {
                status: "created", origin: msg.ANI, queue: {name: msg.DNIS},
                createdTime: Date.now(), lastUpdatedTime: Date.now()
              }
              if(!queueTasks.hasOwnProperty(msg.InteractionId)){
                queueTasks[msg.InteractionId] = convertTask;
                window.queueTasks = queueTasks;
              }
              self.addTask(msg.InteractionId, convertTask);
            }
          });
        customLog("finished loading socket.io")
    }
    document.head.appendChild(socketIOSDK);


    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    customLog("attached shadow");
    window.shadowRoot = this.shadowRoot;
    this.interactionId = null;
  }

  async claimButtonClick(self, event){
    try{
      customLog("claimButtonClicked:");
      customLog(event);
      let taskId = event.id.split("-button")[0];
      this.shadowRoot.getElementById(event.id).classList.add("invisible");
      this.shadowRoot.getElementById(taskId+"-loading").classList.remove("invisible");
      customLog(taskId);
      setTimeout(function(){
        self.shadowRoot.getElementById(taskId+"-loading").classList.add("invisible");
        try{
          customLog(`status of ${taskId} after claim:`)
          customLog(queueTasks[taskId].status);
          if(["queued", "created"].indexOf(queueTasks[taskId].status) >= 0){
            self.shadowRoot.getElementById(taskId+"-button").classList.remove("invisible");
          }
        }catch(ex){
          customLog("claimButton Timeout error:");
          customLog(ex);
          self.shadowRoot.getElementById(taskId+"-button").classList.remove("invisible");
        }
      },10000);
      await self.assignTask(taskId);
    }catch(e){
      customLog("claimButtonClicked Error:");
      customLog(e);
    }
  }

  getTimestampRow(task){
    const createdAgo = makeStringTime(task.createdTime);
    const updatedAgo = makeStringTime(task.lastUpdatedTime);
    return `<td class="column-one">Age: ${createdAgo}</td><td>Last updated: ${updatedAgo}</td>`;
  }


  addTask(taskId, task){
    try{
      customLog('addTask, task:');
      customLog(task);
      const card = document.createElement("div");
      card.id = taskId;
      card.dataset.updated = `${task.lastUpdatedTime}`;
      card.classList.add('card');

      const container = document.createElement("div");
      container.id = taskId+"-container";
      container.classList.add('container');
      let filterStatus = task.status;
      if(["queued", "created"].indexOf(task.status) < 0){
        container.classList.add('faded');
        card.dataset.status = task.status;
      } else {
        filterStatus = "queued";
        card.dataset.status = "queued";
      }

      const table = document.createElement("table");

      let callerName = ""
      if(callerIds[taskId]?.Headers){
        try{
          callerName = callerIds[taskId].Headers.split("caller_id_name=")[1];
          callerName = callerName.split("}")[0];
          callerName = `(${callerName})`
        } catch(ex){
          customLog('addTask callerId split error:');
          customLog(ex);
        }
      }
      const row1 = document.createElement("tr");
      row1.innerHTML = `<td class="column-one origin-cell"><h4><b>${task.origin}</b></h4></td><td><h4>${callerName}</h4></td>`
      const lastCell = document.createElement("td");
      if(["queued", "created"].indexOf(task.status) >= 0){
        const claimButton = document.createElement("button");
        claimButton.id = taskId + "-button";
        claimButton.classList.add("flat-rounded-button");
        claimButton.innerHTML = "Claim";
        let self = this;
        claimButton.addEventListener('click', async function(event){
          await self.claimButtonClick(self, this)
        });
        lastCell.appendChild(claimButton);
        const loadingImg = document.createElement("img");
        loadingImg.id = taskId+"-loading";
        loadingImg.src = `${process.env.HOST_URI}/img/loading-1.gif`;
        loadingImg.classList.add("button-loading-icon");
        loadingImg.classList.add("invisible");
        lastCell.appendChild(loadingImg);
      }
      row1.appendChild(lastCell);
      table.appendChild(row1);
      
      const row2 = document.createElement("tr");
      row2.innerHTML = `<td id="${taskId}-status" class="column-one">${capitalizeFirstLetter(task.status)}</td><td>${task.queue.name}</td>`;
      table.appendChild(row2);

      const row3 = document.createElement("tr");
      row3.id = taskId + "-timestamps";
      row3.innerHTML = this.getTimestampRow(task);
      table.appendChild(row3);

      container.appendChild(table);
      card.appendChild(container);

      let statusType = this.shadowRoot.getElementById(filterStatus);
      if(statusType && !statusType.checked){
        card.classList.add("hidden");
      }

      customLog(this.shadowRoot.getElementById("my-queue"))
      this.shadowRoot.getElementById("my-queue").prepend(card);
      customLog(`appended task ${taskId} to my-queue`);
      
      if(!statusType || statusType.checked){
        setTimeout(function(){
          card.classList.add('animate');
        },100);
      }
    }catch(e){
      customLog(`addTask Error:`);
      customLog(e);
    }  
  }

  updateTask(taskId, task){
    try{
      customLog('updateTask, task:');
      customLog(task);
      const card = this.shadowRoot.getElementById(taskId);
      card.dataset.updated = `${task.lastUpdatedTime}`;
      this.shadowRoot.getElementById(taskId+"-status").innerText = capitalizeFirstLetter(task.status);
      this.shadowRoot.getElementById(taskId+"-timestamps").innerHTML = this.getTimestampRow(task);
      if(["queued", "created"].indexOf(task.status) < 0){
        if(task.status !== card.dataset.status){
          card.dataset.status = task.status;
          this.filterTasks();
        }
        
        this.shadowRoot.getElementById(taskId+"-container").classList.add('faded');
        let button = this.shadowRoot.getElementById(taskId+"-button");
        let loadingIcon = this.shadowRoot.getElementById(taskId+"-loading");
        if(button){
          button.classList.add("invisible");
        }
        if(loadingIcon){
          loadingIcon.classList.add("invisible");
        }
      } else {
        if(task.status !== card.dataset.status){
          card.dataset.status = "queued";
          this.filterTasks();
        }
      }
    }catch(e){
      customLog("updateTask error:");
      customLog(e);
    }
  }

  removeTask(taskId){
    let card = this.shadowRoot.getElementById(taskId);
    card.classList.remove('animate');
    setTimeout(function(){
      card.remove();
    },500);
  }

  async assignTask(taskId){
    try{
        const assignResp = await fetch(`https://api.wxcc-us1.cisco.com/v1/tasks/${taskId}/assign`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${window.myAgentService.webex.token.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        customLog(`assignResp.status:${assignResp.status}`);
    }catch(e){
      customLog("assignTask Error:");
      customLog(e);
    }
  }

  async getTasks(self){
    try{
        //const pastSeconds = 1800; //1800 seconds = 30 minutes;
        const pastSeconds = 600;
        const fromEpochSeconds = Math.floor(Date.now()) - (pastSeconds * 1000);
        const tasksResp = await fetch(`https://api.wxcc-us1.cisco.com/v1/tasks?from=${fromEpochSeconds}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${window.myAgentService.webex.token.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        customLog(`tasksResp.status:${tasksResp.status}`);
        let json = await tasksResp.json();
        customLog(json);
        let tempTasks = {};
        if(json.data?.length > 0){
          let missingCallerIdTasks = [];
          for(let i of json.data){
            tempTasks[i.id] = i.attributes;
            if(!callerIds.hasOwnProperty(i.id)){
              missingCallerIdTasks.push(i.id);
            }
          }
          if(missingCallerIdTasks.length > 0){
            let newCallerIds = await getCallerIds(missingCallerIdTasks);
            customLog("newCallerIds:");
            customLog(newCallerIds);
            for(let j of newCallerIds){
              callerIds[j.InteractionId] = j;
            }
            window.callerIds = callerIds;
          }

          customLog('tempTasks');
          customLog(tempTasks);

          for(let task of Object.keys(tempTasks)){
            let existingCard = self.shadowRoot.getElementById(task)
            if(existingCard){
              customLog('updateTask', task);
              self.updateTask(task, tempTasks[task]);
            } else {
              customLog('newTask', task);
              self.addTask(task, tempTasks[task]);
            }
          }
        }

        for(let card of self.shadowRoot.querySelectorAll(".card")){
          if(fromEpochSeconds > card.dataset.updated){
              customLog('old card', card.id);
              try{
                delete callerIds[card.id];
                delete queueTasks[card.id];
                self.removeTask(card.id);
              }catch(ex){
                customLog("Error with oldTask:");
                customLog(ex);
              }
          }
        }
    } catch(e){
      customLog('getTasks Error:');
      customLog(e);
    }

  }


  filterTasks(){
    let checked = []
    let unchecked = []
    for(let checkbox of queueStatuses){
      let elem = this.shadowRoot.getElementById(checkbox);
      if(elem.checked){
        checked.push(checkbox);
      } else {
        unchecked.push(checkbox);
      }
    }
    customLog("unchecked", unchecked);
    customLog("checked", checked);
    for(let node of this.shadowRoot.querySelectorAll(`.card`)){
      customLog(node);
      if(checked.indexOf(node.dataset.status) >= 0){
        node.classList.remove("hidden");
        setTimeout(function(){
          node.classList.add("animate");
        },200);
      }else{
        node.classList.remove('animate');
        setTimeout(function(){
          node.classList.add("hidden");
        },300);
      }
    }
  }


  async init() {
      customLog("Running Desktop config.init();")
      Desktop.config.init();
      try{
        // ************************** Event listeners ************************** \\

        window.shadowRoot = this.shadowRoot;
        customLog("window.shadowRoot set.");
        customLog(window.shadowRoot);
        customLog(this.shadowRoot);

        for(let checkbox of queueStatuses){
          try{
            addOrReplaceEventListener( this.shadowRoot.getElementById(checkbox), 'change', e => {
              customLog(`${checkbox} change`);
              Cookies.set(checkbox, e.currentTarget.checked);
              this.filterTasks();
            });
          } catch(e){
            customLog(`Error: Listener not attached for ${checkbox} elements`);
            customLog(e);
          }
        }

        customLog("Initialized Buttons.")
        initResult = true;
      } catch (e){
        customLog("init Error:", e);
        initResult = false;
      }
  }

  // Get interactionID, but more info can be obtained from this method
  async getInteractionId() {
    const currentTaskMap = await Desktop.actions.getTaskMap();
    for (const iterator of currentTaskMap) {
      const interId = iterator[1].interactionId;
      return interId;
    }
  }

  async getInteraction() {
    const currentTaskMap = await Desktop.actions.getTaskMap();
    for (const iterator of currentTaskMap) {
      const interId = iterator[1].interaction;
      return interId;
    }
  }


  showLoadingIcon(message, color){
    this.updateResultSpan(message, color);
    this.shadowRoot.getElementById("queue-content").style.display = "none";
    this.shadowRoot.getElementById("loading-icon").style.display = "block";
  }

  showQueueDiv(message, color){
    this.updateResultSpan(message, color);
    this.shadowRoot.getElementById("loading-icon").style.display = "none";
    this.shadowRoot.getElementById("queue-content").style.display = "block";
  }


  updateResultSpan(text, color){
    if(!text){
      text = "";
    } else {
      customLog(`updateResultSpan text:${text}`);
    }
    this.shadowRoot.getElementById("result-span").innerText = text;
    if(!color){
      color = "inherit";
    }
    this.shadowRoot.getElementById("result-span").style.color = color;
  }


    loadContent(){
      try{
        const checkSeconds = 5
        let self = this;

        for(let filter of queueStatuses){
          customLog(filter, Cookies.get(filter));
          if(Cookies.get(filter) === "false"){
            this.shadowRoot.getElementById(filter).checked = false;
          }
        }

        setTimeout(async function(){
          await self.getTasks(self);
        }, 100);
        setInterval(async function(){
          await self.getTasks(self);
        }, checkSeconds * 1000);
        
        this.showQueueDiv();
      }catch(e){
        customLog("loadContent Error:");
        customLog(e);
      }
      
  }

  async connectedCallback() {
    try{
      customLog("connectedCallback")
      await this.init();
      customLog("initResult:");
      customLog(initResult);
      if(!initResult){
        throw new Error("Not initialized!");
      }
      customLog("Desktop.agentStateInfo.latestData", Desktop.agentStateInfo.latestData);
      if(!loaded){

        Cookies.get("queued");

        customLog("myINIT webexService", webexService);
        customLog("myINIT:", Desktop.agentContact)
        //customLog("myINIT accessToken:", Desktop.agentContact.SERVICE.webex.accessToken);
        
        window.myAgentService = Desktop.agentContact.SERVICE;
        window.ccDesktop = Desktop;
        window.lastBroadworksId = null;
        Desktop.agentContact.SERVICE.webex.fetchPersonData("me").then(resp => {
          customLog('Desktop.agentContact.SERVICE.webex.fetchPersonData("me")', resp);
          if(resp.phoneNumbers){
            for (let n of resp.phoneNumbers){
              if(n.type.indexOf("extension") >= 0){
                resp.extension = n.value;
              }
            }
          }
          window.agentDetails = resp;
        });

        Desktop.agentStateInfo.addEventListener('updated', (contact) => {
            customLog('New state updated received:', contact);
        });

        let self = this;
        Desktop.agentContact.addEventListener('eAgentOfferContact', (contact) => {
            customLog('New eAgentOfferContact received:', contact);
            const taskId = contact.data.interactionId;
            let loadingIcon = self.shadowRoot.getElementById(taskId+"loading-");
            customLog(loadingIcon);
            loadingIcon.classList.add("invisible");
        });
        
        this.loadContent();

        customLog("loaded = true");
        loaded = true;
      } else {
        customLog("webex already loaded.");
        this.loadContent();
      }
    }catch(e){
      customLog('connectedCallback error', e);
      let self = this;
      setTimeout(async function(){
        try{
          customLog("Trying to reload...");
          await self.connectedCallback();
        }catch(ex){
          customLog("setTimeout connectedCallback attempt error:");
          customLog(ex);
        }
      }, 3000);
    }
  }

  disconnectedCallback() {
    Desktop.agentContact.removeAllEventListeners();
  }

}

customElements.define("sa-ds-voice-sdk", myDesktopSDK);
