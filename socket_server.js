const { Server } = require("socket.io");
const db = require("./db");
const { nanoid } = require('nanoid');
const { jwtsecret } = require("./config/jwtsecret");
const jwt = require("jsonwebtoken");
const {log_failure} = require("./sync");
const fs = require('node:fs');
const { role, main_server } = require("./config/sync");

var fileshare_peers = [];
if(role=="secondary"){
    fileshare_peers = [main_server.replace("http://","").replace("https://","")];
}

module.exports.get_fileshare_peers = ()=>{
  return fileshare_peers;
}

module.exports.init_socket_server = (httpserver, sync_client)=>{
  const socketserver = new Server(httpserver, {
    cors: {
      origin: "http://localhost:8080"
    },
    maxHttpBufferSize:1024*1024*10 //10mb
  });

  var server_namespace = socketserver.of("/server");
  if(sync_client){
    server_namespace = sync_client;
  }

  socketserver.use((socket, next) => {
    if (socket.handshake.query && socket.handshake.query.token) {
      jwt.verify(socket.handshake.query.token, jwtsecret, async function (err, decoded) {
        if (err) { console.log("not verified"); return next(new Error('Unauthorized')) };
        socket.userid = decoded.userid;
        socket.channels_joined = [];

        let channels = await db.listchannels(decoded.userid);
        channels.forEach(channel => {
          socket.channels_joined.push(channel);
          socket.join(channel);
        });

        next();
      });
    } else {
      console.log("no token");
      next(new Error("Unauthorized"));
    }
  });

  socketserver.on('connection', async (socket) => {
    const userid = socket.userid;

    console.log("New client connected! socket_id:%s uuid:%s", socket.id, userid);

    socket.on('reload', () => {
      console.log("reloading access list.");
      let channels = db.listchannels(userid);

      channels.then((channels) => channels.forEach(channel => {
        socket.channels_joined.push(channel);
        socket.join(channel);
      }));
    });

    socket.on('incoming', async (data, callback) => {
      console.log("message: %s is sent by %s.", data, userid);
      try {
        if (!socket.channels_joined.includes(data[0])) {
          throw new Error("Channel does not exist or isnt joined.");
        }
        const channel = await db.get_channel_by_id(data[0]);
        if (!channel){
          throw new Error("Channel does not exist or isnt joined.");
        }

        const timestamp = new Date().getTime();
        const message_id = nanoid(11);
        await db.savemessage(userid, data[0], message_id, timestamp, data[1]);
        
        if(!channel.on_server){
          //forward to origin server
          console.log("forwarding msg");
         
          const server_id = await db.check_subscription_remote(channel.ID);
          console.log("channel is from server "+server_id);
          if(server_id=="master"){
            await new Promise((resolve, reject)=> server_namespace.timeout(2000).emit("message", {"ID":message_id,"channel":channel.ID,"content":data[1],"timestamp":timestamp,"sender":userid}, (err,response)=>{
              if(err || response.length==0){ 
                reject("Message has failed to deliver.");
              }else{
                console.log("successfully forwarded!");
                resolve();
              }
            }));
          }else{
            await new Promise((resolve, reject)=> server_namespace.to(server_id).timeout(2000).emit("message", {"ID":message_id,"channel":channel.ID,"content":data[1],"timestamp":timestamp,"sender":userid}, (err,response)=>{
              if(err || response.length==0){ 
                reject("Message has failed to deliver.");
              }else{
                console.log("successfully forwarded!");
                resolve();
              }
            }));
          }
        }else{
          //check for any subscriptions and forward message
          console.log("checking subscriptions");
          const subscribed_server = await db.check_subscription(channel.ID);
          if(subscribed_server){
            if(subscribed_server=="master"){
              server_namespace.emit("message", {"channel": data[0], "sender": userid, "ID": message_id, "timestamp": timestamp, "content": data[1]});
            }else{
              server_namespace.to(subscribed_server).emit("message", {"channel": data[0], "sender": userid, "ID": message_id, "timestamp": timestamp, "content": data[1]});
            }
          }
        }

        //broadcast to clients in the chatroom
        socket.to(data[0]).emit('message', JSON.stringify({ "channel": data[0], "sender": userid, "ID": message_id, "timestamp": timestamp, "content": data[1] }));
        callback({//respond to sender
          res: "ok",
          timestamp: timestamp,
          id: message_id
        });
      } catch (error) {
        console.log(error);
        if(typeof callback === "function"){
          callback({
            res: "fail"
          });
        }
      }
    });

    socket.on('delete', async (data, callback) => {
      console.log("User is trying to delete message: " + data);
      const userid = socket.userid;
      try {
        var parsed_data = JSON.parse(data);
        const message = await db.get_message_by_id(parsed_data[1]);
        
        if (!message) {
          callback({
            res: "fail"
          });
          return;
        }

        const channel = await db.get_channel_by_id(parsed_data[0]);
        
        if (message.sender != userid && channel.owner != userid) {
          console.log("user has no privilege to delete this message.");
          callback({
            res: "fail"
          });
          return;
        }

        const server_id = await db.check_subscription_remote(channel.ID);

        if(channel.on_server==false){
          if(server_id=="master"){
            await new Promise((resolve, reject)=> server_namespace.timeout(2000).emit("delete_message", message, (err,response)=>{
              if(err || response.length==0){
                reject("Message has failed to delete.");
              }else{
                console.log("successfully deleted!");
                resolve();
              }
            }));
          }else{
            await new Promise((resolve, reject)=> server_namespace.to(server_id).timeout(2000).emit("delete_message", message, (err,response)=>{
              if(err || response.length==0){
                reject("Message has failed to delete.");
              }else{
                console.log("successfully deleted!");
                resolve();
              }
            }));
          }
        }else{
          //check for any subscriptions and forward deletion
          console.log("checking subscriptions");
          const subscribed_server = await db.check_subscription(channel.ID);
          
          if(subscribed_server){
            if(subscribed_server=="master"){
              server_namespace.emit("delete_message", {"ID":message.ID, "channel":channel.ID});
            }else{
              server_namespace.to(subscribed_server).emit("delete_message", {"ID":message.ID, "channel":channel.ID}, (err, response)=>{
                console.log(response);
              });
            }
          }
        }

        await db.deletemessage(message.ID);
        socket.to(channel.ID).emit('delete', JSON.stringify({"ID":message.ID, "channel":channel.ID}));
        console.log("Successfully deleted message: " + message.ID);
        callback({
          res: "ok"
        });
      } catch (error) {
        console.log(error);
        if(typeof callback === "function"){
          callback({
            res: "fail"
          });
        }
      }
    });

    socket.on("admaction", async (data, callback) => { //TODO: implement deletion of channel and sync forwarding
      const userid = socket.userid;
      console.log(`admin action is recieved. user:${userid} action:${data}`);

      try {
        const parsed = JSON.parse(data);
        const channel_id = parsed[0];

        if (!socket.channels_joined.includes(channel_id)) {
          throw new Error("Channel does not exist or isnt joined.");
        }
        const channel = await db.get_channel_by_id(channel_id);
        if (userid !== channel.owner) {
          throw new Error('no privilege');
        }

        if (parsed[1].action == "ban") {
          const all_room_clients = socketserver.sockets.adapter.rooms.get(channel_id);

          for (let clientId of all_room_clients) {
            let cli_socket = socketserver.sockets.sockets.get(clientId);
            console.log(cli_socket.userid);
            console.log(parsed[1].target);
            if (cli_socket.userid == parsed[1].target) {
              console.log("target match");
              cli_socket.leave(channel_id);
              cli_socket.channels_joined = cli_socket.channels_joined.filter((item) => item !== channel_id);
              cli_socket.emit("ban", channel_id);
              break;
            }
          }
        }
      } catch (e) {
        console.log(e);
      }
    });
  });

  return [server_namespace, socketserver];
}

module.exports.init_sync = (server_namespace, user_namespace, client=false, server_id)=>{
  if(!client){
    server_namespace.server_id = server_id;
    server_namespace.use((socket, next) =>{
      if(socket.handshake.query.serverID){
        socket.is_server=true;
        socket.server_id=socket.handshake.query.serverID;
        socket.join(socket.server_id);
        if("x-forwarded-for" in socket.handshake.headers){
          var ip = socket.handshake.headers["x-forwarded-for"].split(",")[0];
        }else{
          var ip = socket.handshake.address;
        }
        if(!fileshare_peers.includes(ip)){
          fileshare_peers.push(ip);
        }
        console.log("sheepchat server connected. IP:%s, server id:%s",ip,socket.server_id);
        next();
      }
    });
  }
  server_namespace.on(client? "connect":"connection", async (socket) => {
    if(client){
      console.log("Sync client connected to master server.")
      socket = server_namespace;
    }
    socket.on('disconnect', async ()=>{
      console.log("disconnected from sync server/client. server ID:"+socket.server_id);
      await db.unsubscribe_server(socket.server_id);
    });
    socket.on('new_channel', async (data, callback)=>{
      try{
        await db.createchannel(data.id, data.name, data.owner, false);
        console.log(data);
        if(!client){
          //broadcast to other secondary servers
          socket.broadcast.timeout(20000).emit('new_channel', data, (err, response)=>{
            if(err){
              log_failure("new_channel", data);
            }else{
              console.log(response);
            }
          });
        } 
        callback({res:"ok"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('join', async (data, callback)=>{
      try{
        const channel = await db.get_channel_by_id(data.channel);
        if(!channel){
          callback({res:"unavailable"});
          return;
        }
        await db.add_channel_to_user(data.user, data.channel, false);
        callback({res:"ok"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('new_invite', async (data, callback)=>{
      try{
        await db.store_invite_code(data.code, data.channel, data.expire);
        callback({res:"ok"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('delete_channel', async (data, callback)=>{
      try{
        await db.deletechannel(data.id);
        console.log(data);
        if(!client){
          //broadcast to other secondary servers
          socket.broadcast.timeout(20000).emit('delete_channel', data, (err, response)=>{
            if(err){
              log_failure("delete_channel", data);
            }else{
              console.log(response);
            }
          });
        }
        callback({res:"ok"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('subscribe', async (data, callback)=>{
      try{
        const channel = await db.get_channel_by_id(data.channel_id);
        console.log("server is trying to subscribe to:"+channel.ID);
        if(channel.on_server==1){
          if(client){
            await db.subscribe("master", data.channel_id);//messages from subscribed channel will be forwarded
          }else{
            await db.subscribe(socket.server_id, data.channel_id);//messages from subscribed channel will be forwarded
          }

          console.log(server_id+" type:"+typeof server_id);
          callback({res:server_id});//return own server id
          return;
        }
        callback({res:"unavailable"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('download', async (data, callback)=>{
      console.log(data);
      
      const channel_data = await db.get_channel_by_id(data.channel_id);
      if(!channel_data){ //in case the channel was already deleted, send false
        socket.emit("data", false);
        return;
      }
      const message_data = await db.getmessagebulk(data.channel_id, 0, 100);//TODO: subscribe to another secondary if requested channel is not here
      callback(message_data);
    });
    socket.on('delete_message', async (data, callback)=>{
      await db.deletemessage(data.ID);
      user_namespace.to(data.channel).emit('delete', JSON.stringify({ "channel": data.channel, "ID": data.ID}));
      console.log("Successfully deleted message: " + data.ID);
      callback({
        res: "ok"
      });
    });
    //recieve messages from server for subscribed channels
    socket.on('message', async (data, callback)=>{
      console.log("Recieved a message from peer server! %s", data);
      try{
        await db.savemessage(data.sender, data.channel, data.ID, data.timestamp, data.content);
        user_namespace.to(data.channel).emit('message',JSON.stringify(data));
        /*
        const subscribed_query = db.check_subscription(data.channel);
        subscribed_query.then((subscribed_server)=>{
          if(subscribed_server){
            server_namespace.to(subscribed_server).emit("message", data);
          }
        });*/
        callback({res:"ok"});
      }catch(err){
        console.log(err);
      }
    });
    socket.on('getuser', async (data, callback)=>{
      const user = await db.user(data)
      if(!user){
        callback({res:"unavailable"})
      }else{
        if(user.profile_pic){
          fs.readFile(user.profile_pic, {root:__dirname}, (err, data) => {
            if (!err) {
              user.profile_pic_file = data;
            }
            console.log(err);
            callback(user);
          });
        }else{
          callback(user);
        }
      }
    });
  });
  return server_namespace;
}