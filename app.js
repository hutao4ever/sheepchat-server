const express = require("express")
const session = require('express-session')
const crypto = require('crypto')
const {createServer} = require("http")
const {broadcast_sync_channel, broadcast_invite, load_offserver_channel, query_user, join_remote_channel} = require("./sync")
const {init_sync, init_socket_server, get_fileshare_peers} = require("./socket_server")
const busboy = require('connect-busboy')
const { io } = require("socket.io-client");
const {PORT} = require("./config/port")

const app = express();

const user_routes = require("./routes/user_routes")
const chat_routes = require("./routes/chat_routes")

const {upload_max_size} = require("./config/fileupload")
const { main_server, server_id, role, ENABLE } = require("./config/sync")

//the server
const httpserver = createServer(app)

var session_middleware = session({
    secret: crypto.randomBytes(16).toString('base64'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
});

app.use(busboy({
    highWaterMark: 2 * 1024 * 1024, 
    limits:{
        fileSize: upload_max_size
    }
}));

app.use("/static", express.static("static"));
app.use(session_middleware);
app.use(express.json());
app.use(express.urlencoded({extended:false}));

//for recieving events from secondary sheepchat servers
if(ENABLE){
    if(role=="main"){
        const namespaces = init_socket_server(httpserver);
        var sync_socket = init_sync(namespaces[0], namespaces[1], false, server_id);
    }else{
        console.log("running as secondary server.");
        const socket = io.connect(String(new URL("/server", main_server)),{
            query:{interservercomm:true,serverID:server_id,appPort:PORT}
        });
        const namespaces = init_socket_server(httpserver, socket);
        var sync_socket = init_sync(socket, namespaces[1], true, server_id);
    }
}else{
    var sync_socket = null;
}

app.use((req,res,next)=>{
    req.sync_channel=(channel)=>{broadcast_sync_channel(sync_socket, channel)}
    req.sync_invite=(invite)=>{broadcast_invite(sync_socket, invite)}
    req.load_offserver_channel=async(channel)=>{return await load_offserver_channel(sync_socket, channel)}
    req.query_user=async(userid)=>{return await query_user(sync_socket, userid)}
    req.join_remote_channel=async(channel, userid)=>{return await join_remote_channel(sync_socket, channel, userid)}
    req.file_share_peers=get_fileshare_peers;
    next();
});
app.use(user_routes);
app.use(chat_routes);

httpserver.listen(PORT,()=>{
    console.log('Web app is listening on port %d.', PORT);
})