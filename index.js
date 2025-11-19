import express from "express";
import cors from "cors";
import 'dotenv/config';
//import fetch from "node-fetch";
import http from "http";
import { Server } from "socket.io";

import Cache from 'ttl-mem-cache';
const cache = new Cache();

const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server,{
  cors: {
    origin: "https://desktop.wxcc-us1.cisco.com",
    methods: ["GET", "POST"],
    //allowedHeaders: ["my-custom-header"],
    credentials: true
  }
} );

//needed for CommonJS
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
//const __redirecturi = process.env.HOST_URI + "/auth";

//console.log(__dirname + "/src");
//app.use(cors());
app.use(express.static(__dirname + "/src"));
app.use(express.json());



app.post('/', async (req, res) => {
  console.log('/ body:');
  console.log(req.body);
  if(req.body?.InteractionId){
    cache.set(req.body.InteractionId, req.body, 3600 * 1000);
    //io.emit("message", req.body);
    io.to(req.body.OrgId).emit('message', req.body);
    console.log("Cached", req.body.InteractionId);
  }
  res.status(200).send('OK');
});

app.options('/callerIds', cors());
app.post('/callerIds', cors(), async (req, res) => {
  let response = [];
  console.log('/callerIds body:');
  console.log(req.body);
  if(req.body?.taskIds && req.body.taskIds.length > 0){
    for(let t of req.body.taskIds){
      let callerId = cache.get(t);
      if(callerId){
        response.push(callerId);
      } else {
        response.push({InteractionId: t});
      }
    }
  }
  console.log('Found callerIds:');
  console.log(response);
  res.setHeader('Content-Type',"application/json");
  res.send(JSON.stringify(response));
});


io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);
  console.log(socket.handshake.auth);
  if(socket.handshake.auth.orgId){
    console.log("joining", socket.handshake.auth.orgId);
    socket.join(socket.handshake.auth.orgId);
  }
  socket.on('message', (msg) => {
    console.log(socket.id, "sent message:");
    console.log(msg);
    //io.to(socket.id).emit("message", {"status":"hello"});
  })
});

server.listen(port, () => {
  console.log(`listening on ${port}`);
});
