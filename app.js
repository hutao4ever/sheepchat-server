const express = require("express")
const app = express()
const session = require('express-session')
const crypto = require('crypto')
const path = require('path')
const {createServer} = require("http")
const ChatServer = require("./socket_server.js")
const busboy = require('connect-busboy');

const user_routes = require("./routes/user_routes")
const chat_routes = require("./routes/chat_routes")
//const upload_routes = require("./routes/user_file_routes.js")

//the server
const httpserver = createServer(app)

app.use(express.static('./public'));

var session_middleware = session({
    secret: crypto.randomBytes(16).toString('base64'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
});

app.use(busboy({
    highWaterMark: 2 * 1024 * 1024, // Set 2MB buffer
    limits:{
        fileSize: 15*1024*1024 // 15MB filesize limit
    }
}));

app.use(session_middleware);
app.use(express.json());
app.use(express.urlencoded({extended:false}));

new ChatServer(httpserver);

app.use(user_routes);
app.use(chat_routes);

//react pages
app.get('*',(req,res)=>{
    res.sendFile(path.resolve(__dirname, './public/index.html'));    
})

httpserver.listen(8080,()=>{
    console.log('Web app is listening on port 8080.');
})