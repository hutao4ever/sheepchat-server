const express = require("express")
const app = express()
const session = require('express-session')
const crypto = require('crypto')
const {createServer} = require("http")
const ChatServer = require("./socket_server.js")
const busboy = require('connect-busboy')

const user_routes = require("./routes/user_routes")
const chat_routes = require("./routes/chat_routes")

const {upload_max_size} = require("./config/fileupload")
const { sync } = require("./sync.js")
const SYNC_ENABLE = require("./config/sync.js").ENABLE;
const SYNC_HOST = require("./config/sync.js").host;

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

app.use(session_middleware);
app.use(express.json());
app.use(express.urlencoded({extended:false}));

new ChatServer(httpserver);

app.use(user_routes);
app.use(chat_routes);

httpserver.listen(8080,()=>{
    console.log('Web app is listening on port 8080.');
})

//the sync server
if(SYNC_ENABLE){
    const sync_server = createServer(sync);
    sync_server.listen(8083, SYNC_HOST, ()=>{
        console.log(`Sync server is listening on ${SYNC_HOST}:8083`);
    });
}