const db = require("../db")
const uuid = require("uuid")
const {renew_token} = require("./user");
const { nanoid, random } = require('nanoid');
const fs = require("fs");
const path = require("path");

module.exports.createchannel = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send(JSON.stringify({"status":"fail","err":'Unauthorized'}));
        return;
    }

    const {name} = req.body;
    if(!name || name.length>30){
        res.status(400).send(JSON.stringify({"status":"fail","err":'Invalid name'}));
        return;
    }

    console.log(`user ${req.session.userid} is creating a channel:" ${name} "`);

    var channel_id = uuid.v4();
    await db.createchannel(channel_id, name, req.session.userid);
    await db.add_channel_to_user(req.session.userid, channel_id);
    req.session.channels_joined.push(channel_id);

    res.status(200).json({"status":"success", "channel_id":channel_id, "token":renew_token(req)});//renew jwt token so socket server registers the new channel
}

module.exports.deletechannel = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    const {channel_id} = req.body;
    if(!channel_id){
        res.status(400).json({status:'fail', error:'invalid'});
        return;
    }
    const channel = await db.get_channel_by_id(channel_id);
    
    if(!req.session.channels_joined.includes(channel_id)){
        res.status(403).json({status:'fail', error:'no access'});
        return;
    }

    if(req.session.userid!==channel.owner){
        res.status(403).json({status:'fail', error:'no privilege'});
        return;
    }

    await db.deletechannel(channel_id);

    await db.remove_channel_from_user(req.session.userid, channel_id, true);

    for(var i=0;i<req.session.channels_joined.length;i++){//remove channel id from session variable
        if(req.session.channels_joined[i] ==channel_id){
            req.session.channels_joined.splice(i,1);
        }
    }

    return res.status(200).json({"status":"success"});
}

module.exports.loadchannels = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    
    console.log("loading channels");
    const list = await db.listchannels(req.session.userid);
    var return_list = [];
    req.session.channels_joined = [];

    for(let channel_id of list){
        const channel_obj = await db.get_channel_by_id(channel_id);
        if(!channel_obj){//if channel does not exist, delete it from the list
            await db.remove_channel_from_user(req.session.userid, channel_id, true);
            continue;
        }
        req.session.channels_joined.push(channel_id);
        return_list.push({"channel_id":channel_id, "channel_name":channel_obj.name});
    }
    
    res.status(200).json(return_list);
}

module.exports.loadmessage = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    if(!req.query.channel){
        res.status(400).send('channel unspecified');
        return;
    }

    const joined_channels = await db.listchannels(req.session.userid);
    if(!joined_channels.includes(req.query.channel)){
        res.status(403).json({"status":"fail", "error":"no access"});
        return;
    }

    if(!req.query.page || isNaN(parseInt(req.query.page)) || req.query.page < 0){
        res.status(400).send('page unspecified');
        return;
    }
    
    var pageindex = parseInt(req.query.page);
    
    var pastmessages = await db.getmessagebulk(req.query.channel, pageindex*40, 40);

    if(pastmessages.length < 40){
        pastmessages.push("end");
    }
    console.log("read chat history");
    
    return res.status(200).json({"status":"success","data":pastmessages});
}

module.exports.get_member_list = async (req, res)=>{
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    if(!req.query.channel){
        res.status(400).json({status:'fail', error:'channel unspecified'});
        return;
    }
    if(!req.session.channels_joined.includes(req.query.channel)){
        res.status(403).send({status:'fail', error:'no access'});
        return;
    }

    const list = await db.get_member_list(req.query.channel);
    const banned_list = await db.get_all_banned(req.query.channel);
    var list_with_username = [];
    var banned_list_with_username = [];

    //get owner of channel
    const channel = await db.get_channel_by_id(req.query.channel);
    const owner = channel.owner;
    
    for(let element of list){
        let user = await db.user(element);
        let ownership = owner==element?true:false;
        list_with_username.push({id:element, username:user.username, isowner:ownership});
    }

    for(let element of banned_list){
        let user = JSON.parse(await db.user_lookup(element, false));
        banned_list_with_username.push({id:element, username:user.username});
    }

    return res.json([list_with_username,banned_list_with_username]);
}

module.exports.ban = async (req, res) =>{
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    const {channel_id, ban_target} = req.body;
    
    if(!channel_id || !ban_target){
        res.status(400).json({status:'fail', error:'invalid'});
        return;
    }
    if(!req.session.channels_joined.includes(channel_id)){
        res.status(403).json({status:'fail', error:'no access'});
        return;
    }
    
    const channel = await db.get_channel_by_id(channel_id);

    if(req.session.userid!==channel.owner){
        res.status(403).json({status:'fail', error:'no privilege'});
        return;
    }

    console.log(`user ${ban_target} has been banned from ${channel_id}`);
    await db.ban_user_from_channel(channel_id, ban_target);
    return res.status(200).json({status:'success'});
}

module.exports.unban = async (req, res) =>{
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    const {channel_id, unban_target} = req.body;
    console.log("bae");
    if(!channel_id || !unban_target){
        res.status(400).json({status:'fail', error:'invalid'});
        return;
    }
    if(!req.session.channels_joined.includes(channel_id)){
        res.status(403).json({status:'fail', error:'no access'});
        return;
    }
    
    const channel = await db.get_channel_by_id(channel_id);

    if(req.session.userid!==channel.owner){
        console.log("unprivileged");
        res.status(403).json({status:'fail', error:'not admin'});
        return;
    }

    console.log(`user ${unban_target} has been unbanned from ${channel_id}`);
    await db.unban_user_from_channel(channel_id, unban_target);
    return res.status(200).json({status:'success'});
}

module.exports.generate_join_code = async (req, res)=>{
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    const {channel} = req.body;
    if(!channel){
        res.status(400).json({status:'fail', error:'channel unspecified'});
        return;
    }
    if(!req.session.channels_joined.includes(channel)){
        res.status(403).send({status:'fail', error:'no access'});
        return;
    }

    let random_code = nanoid();
    await db.store_invite_code(random_code, channel, Math.floor(Date.now() / 1000)+60*60*48); //store a token that will expire in two days
    return res.status(200).json({status:'success', code:random_code});
}

module.exports.joinchannel = async (req, res)=>{
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    const {join_code} = req.body;
    if(!join_code){
        res.status(400).send('invalid');
        return;
    }
    
    const channel_id = await db.get_invite_channel(join_code);
    if(!channel_id){
        res.status(200).json({"status":"fail","err":"invalid code"});
        return;
    }

    const channel_obj = await db.get_channel_by_id(channel_id);
    if(!channel_obj){
        res.status(200).json({"status":"fail","err":"invalid code"});
        return;
    }

    console.log(`user ${req.session.userid} is trying to join ${channel_id}`);
    if(await db.check_ban(channel_id, req.session.userid)){
        return res.status(200).json({"status":"fail","err":"banned"});
    }

    const joined_channels = await db.listchannels(req.session.userid);
    
    if(joined_channels.includes(channel_id)){
        return res.status(200).json({"status":"fail","err":"duplicate"});
    }

    await db.add_channel_to_user(req.session.userid, channel_id);
    req.session.channels_joined.push(channel_id);

    return res.status(200).json({"status":"success", "id":channel_id, "name":channel_obj.name});
}

module.exports.change_channel_name = async (req, res) => {
    const {channel_id, name} = req.body;
    if(!channel_id){
        return res.status(400).json({"status":"fail", "error":"no channel id"});
    }
    if(!name || name.length>30){
        return res.status(400).json({"status":"fail", "error":"invalid name"});
    }

    console.log("Changing channel name. Channel id:"+req.body.channel_id);

    const channel = await db.get_channel_by_id(channel_id);
    
    if(channel.owner != req.session.userid){
        console.log("not admin");
        return res.json({"status":"fail", "err":"not admin"});
    }
    
    console.log(name);
    await db.editchannel(channel_id, name, null);

    return res.status(200).json({"status":"success"});
}

module.exports.change_channel_icon = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({"status":"fail", "error":"no file"});
    }

    const {channel_id} = req.body;
    if(!channel_id){
        return res.status(400).json({"status":"fail", "error":"no channel id"});
    } 
  
    console.log("Changing channel icon. Channel id:"+req.body.channel_id);

    const channel = await db.get_channel_by_id(channel_id);
    
    if(channel.owner != req.session.userid){
        console.log("not admin");
        return res.json({"status":"fail", "err":"not admin"});
    }
    
    await db.editchannel(req.body.channel_id, null, req.file.path);
    
    return res.json({"status":"success"});
}

module.exports.get_channel_icon = async (req, res) => {
    if(!req.query.channel_id){
        return res.status(400).json({"status":"fail", "error":"no channel id"});
    }
    
    const channel = await db.get_channel_by_id(req.query.channel_id);

    if(!channel){
        return res.status(200).json({"status":"fail", "error":"not found"});
    }

    if(channel.icon != ""){
        return res.status(200).sendFile(channel.icon, {root:__dirname+"/../"}, (err)=>{
            if(err){
              console.log(err);
            }
        });
    }
    return res.status(404);
}

module.exports.upload_file = async (req, res) => {
    var ids = [];
    var finish = false;
    var counter = 0;
    req.busboy.on('field', (fieldname, value)=>{
        if(fieldname == "channel_id" && req.session.channels_joined.includes(value)){
            console.log("valid upload channel_id:"+value);
            req.busboy.on('file', (fieldname, file, fileinfo) => {
                console.log(fileinfo);
                if(file.truncated){file.resume(); return;}
                counter ++;
            
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                var filename = 'user_uploaded-' + uniqueSuffix + path.extname(fileinfo.filename);

                var file_path = path.join('uploads/', filename);
                // Create a write stream of the new file
                const fstream = fs.createWriteStream(file_path);
                // Pipe it trough
                file.pipe(fstream);
            
                // On finish of the upload
                fstream.on('close', () => {
                    counter --;
                    const file_id = uuid.v4();
                    db.save_attached_file(file_id, file_path);
                    ids.push(file_id);
                    console.log(`Upload of '${filename}' finished`);

                    if(finish && counter == 0){ //if the whole request has been done
                        res.json({"status":"success", "all_ids":ids});//write response
                    }
                });
            });
        }
    })

    req.busboy.on("finish", ()=>{
        finish = true;
    });

    if(req.session.userid){
        req.pipe(req.busboy);
    }else{
        return res.status(401).send("Unauthorized");
    }
}

module.exports.get_file = async (req, res) => {
  if(!req.session.userid){
    res.status(401).send('Unauthorized');
    return;
  }
  if(!req.query.id){
    console.log("upload file id is not found!");
    res.status(400).send('no file id');
    return;
  }
  
  var filepath = await db.get_attached_file(req.query.id);
  console.log(filepath);
  if(!filepath){
    console.log("upload not found!");
    return res.status(200).json({"status":"fail", "err":"not found"});
  }

  res.status(200).sendFile(filepath, {root:__dirname+"/../"}, (err)=>{
    if(err){
       console.log("error retrieving upload!"); 
       console.log(err);
    }
  });
}