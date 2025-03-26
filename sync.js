const db = require("./db");
const fs = require("fs");
const {ENABLE} = require("./config/sync");

var log_failure = (failed_event, data)=>{
    const timestamp = Date.now();
    fs.appendFile('message.txt', JSON.stringify([timestamp,failed_event,data]), function (err) {
        if (err) throw err;
        console.log(`Written a failed event on ${new Date(timestamp).toUTCString()}`);
    });
}

module.exports.log_failure = log_failure;

module.exports.broadcast_sync_channel = (socket, channel)=>{
  if(!ENABLE){
    return false;
  }
  
  socket.timeout(20000).emit('new_channel', channel, (err, responses)=>{
    if(err){
      console.log(err);
      log_failure("new_channel", channel);
    }
  });
}

module.exports.broadcast_invite = (socket, invite)=>{
  if(!ENABLE){
    return false;
  }
  socket.timeout(20000).emit('new_invite', invite, (err, responses)=>{
    if(err){
      console.log(err);
      log_failure("new_invite", invite);
    }
  });
}

module.exports.join_remote_channel = async (socket, channel_id, user_id)=>{
  if(!ENABLE){
    return false;
  }
  try{
    return await new Promise((resolve, reject)=>{
      socket.timeout(20000).emit('join', {"channel":channel_id, "user":user_id}, (err, responses)=>{
        if(err){
          console.log(err);
          reject("an error occured.");
          return;
        }
        if(Array.isArray(responses)){
          for(const response of responses){
            if(response.res == "ok"){
              resolve(true);
              return;
            }
          }
        }else{
          if(responses.res == "ok"){
            resolve(true);
            return;
          }
        }
        reject("no response");
      });
    });
  }catch(err){
    console.log("join_remote_channel promise rejection:"+err);
    return false;
  }
}

module.exports.load_offserver_channel = async (socket, channel)=>{
  if(!ENABLE){
    return false;
  }
  try{
    var result = await new Promise((resolve, reject)=>{
      socket.timeout(20000).emit('subscribe', {channel_id:channel}, (err, responses)=>{
        if(err){
          console.log(err);
          reject("an error occured.");
          return;
        }
        let res_server_id = false;
        console.log("console log on line 51");
        console.log(responses);
        if(Array.isArray(responses)){//the sync client will recieve an object, while the sync server recieves an array
          for(const response of responses){
            if(response.res != "unavailable"){
              res_server_id = response.res; //the response is server id of the responder
              break;
            }
          }
        }else{
          res_server_id = "master"; 
        }
        if(!res_server_id){
          reject("unavailable");
          return;
        }

        if(res_server_id=="master"){
          socket.timeout(20000).emit('download', {channel_id:channel}, (err, response)=>{//emit to master server
            if(err){
              reject("connection err");
              return;
            }
            if(response.length){//check if array is not empty
              for(const message of response){
                //console.log(message);
                db.savemessage(message.sender, message.channel, message.ID, message.timestamp, message.content).catch((err)=>console.log(err));
              }
            }
            resolve([response,res_server_id]);
          })
        }else{
          socket.to(res_server_id).timeout(20000).emit('download', {channel_id:channel}, (err, response)=>{
            if(err){
              reject("connection err");
              return;
            }
            if(response.length){//check if array is not empty
              response=response[0];//socket.io gives an array on the server side
              for(const message of response){
                //console.log(message);
                db.savemessage(message.sender, message.channel, message.ID, message.timestamp, message.content).catch((err)=>console.log(err));
              }
            }
            resolve([response,res_server_id]);
          })
        }
      });
    });
  }catch(err){
    console.log("load_offserver_channel promise rejection:"+err);
    return false;
  }

  return result;
}

module.exports.query_user = async (socket, userid)=>{
  return await new Promise((resolve)=>{
    socket.timeout(20000).emit('getuser', userid, (err, response)=>{
      if(err){
        console.log("error on sync.js:96"+err);
        reject("an error occured.");
        return;
      }
      if(response && !Array.isArray(response)){
        if(response.res != "unavailable"){
          db.cache_user(response.ID, response.username, response.profile_pic);
          if(response.profile_pic_file){
            fs.writeFile(response.profile_pic, response.profile_pic_file, {root:__dirname+"/../"}, (err)=>{
              console.log("error on sync.js:103"+err);
            });
          }
          resolve(response);
          return;
        }
      }
      
      if(Array.isArray(response)){
        for(const response_ of response){
          if(response_.res != "unavailable"){
            db.cache_user(response_.ID, response_.username, response_.profile_pic);
            if(response_.profile_pic_file){
              fs.writeFile(response_.profile_pic, response_.profile_pic_file, {root:__dirname+"/../"}, (err)=>{
                console.log("error on sync.js:117"+err);
              });
            }
            resolve(response_);
            return;
          }
        }
      }

      resolve(false);
    });
  });
}