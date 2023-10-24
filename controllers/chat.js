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
    await db.addchannel_to_user(req.session.userid, channel_id);
    req.session.channels_joined.push(channel_id);
    console.log(req.session.channels_joined);
    res.status(200).json({"status":"success", "channel_id":channel_id, "token":renew_token(req)});//renew jwt token so socket server registers the new channel
}

module.exports.loadchannels = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    
    console.log("loading channels");
    const list = await db.listchannels(req.session.userid);
    var return_list = [];

    for(let channel_id of list){
        const channel_obj = await db.get_channel_by_id(channel_id);
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

    const if_joined = await db.check_joined_channel(req.session.userid, req.query.channel);
    if(!if_joined){
        res.status(403).json({"status":"fail", "error":"no access"});
        return;
    }

    if(!req.query.page || isNaN(parseInt(req.query.page)) || req.query.page < 0){
        res.status(400).send('page unspecified');
        return;
    }
    
    var pageindex = parseInt(req.query.page);

    const length = await db.getlength(req.query.channel);
    
    if(pageindex*40 > length){
        var pastmessages = await db.readtext(req.query.channel, 0, length%40);
        var e = true;
    }else{
        var pastmessages = await db.readtext(req.query.channel, -pageindex*40, (-pageindex+1)*40 || -1);
    }

    if(e){
        pastmessages.push("end");
    }
    console.log("read chat history");
    console.log(pastmessages.length);
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
        let user = JSON.parse(await db.getstring(element));
        let ownership = owner==element?true:false;
        list_with_username.push({id:element, username:user.username, isowner:ownership});
    }

    for(let element of banned_list){
        let user = JSON.parse(await db.getstring(element));
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
        console.log("unprivileged");
        res.status(403).json({status:'fail', error:'no privilege'});
        return;
    }

    console.log(`user ${ban_target} has been banned from ${channel_id}`);
    await db.ban_user_from_channel(channel_id, ban_target);
    await db
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
        res.status(403).json({status:'fail', error:'no privilege'});
        return;
    }

    console.log(`user ${unban_target} has been unbanned from ${channel_id}`);
    await db.unban_user_from_channel(channel_id, unban_target);
    return res.status(200).json({status:'success'});
}

/*
module.exports.channelquery = async (req, res) => {
    if(!req.session.userid){
        res.status(401).send('Unauthorized');
        return;
    }
    if(!req.query.channel){
        res.status(400).send('invalid');
        return;
    }
    var channel = await db.get_channel_by_id(req.query.channel);
    if(!channel){
        res.status(200).send('channel not found');
        return;
    }
    var joined = false;
    if(req.session.channels_joined.includes(req.query.channel)){
        joined = true;
    }
    res.status(200).json({"name":channel["name"], "joined":joined});
}*/

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
    await db.store_invite_code(random_code, channel, Math.floor(new Date().getTime() / 1000)+60*60*48); //store a token that will expire in two days
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
    
    var channel = await db.get_invite_channel(join_code);
    if(!channel){
        res.status(200).json({"status":"fail","err":"invalid code"});
        return;
    }

    let channel_obj = channel[2];
    if(Math.floor(new Date().getTime() / 1000) > channel[1]){
        console.log("expired code detected");
        db.delete_invite_code(join_code);
        return res.status(200).json({"status":"fail","err":"invalid code"});
    }

    console.log(`user ${req.session.userid} is trying to join ${channel[0]}`);
    if(await db.check_ban(channel[0], req.session.userid)){
        return res.status(200).json({"status":"fail","err":"banned"});
    }
    if(await db.check_joined_channel(req.session.userid, channel[0])){
        return res.status(200).json({"status":"fail","err":"duplicate"});
    }

    await db.addchannel_to_user(req.session.userid, channel[0]);
    req.session.channels_joined.push(channel[0]);

    return res.status(200).json({"status":"success", "id":channel[0], "name":channel_obj.name, "token":renew_token(req)});
}

module.exports.imageupload = async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({"status":"fail", "error":"no file uploaded"});
    }
  
    var all_ids = [];
    console.log("uploading file. Channel id:"+req.body.channel_id);

    await Promise.all(req.files.map(async file => {
        console.log(file.filename);
        console.log(file.size);
        let file_id = uuid.v4();
        await db.save_attached_file(req.body.channel_id, file_id, file.path);
        all_ids.push(file_id);
    }));
    
    return res.json({"status":"success", "all_ids":all_ids});
}

module.exports.upload_file = async (req, res) => {
    var ids = [];
    req.busboy.on('field', (fieldname, value)=>{
        if(fieldname == "channel_id" && req.session.channels_joined.includes(value)){
            console.log("valid upload channel_id:"+value);
            var channel_id = value;
            req.busboy.on('file', (fieldname, file, fileinfo) => {
                console.log(fileinfo);
                if(file.truncated){file.resume(); return;}
            
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                var filename = 'user_uploaded-' + uniqueSuffix + path.extname(fileinfo.filename);

                var file_path = path.join('uploads/', filename);
                // Create a write stream of the new file
                const fstream = fs.createWriteStream(file_path);
                // Pipe it trough
                file.pipe(fstream);
            
                // On finish of the upload
                fstream.on('close', () => {
                    const file_id = uuid.v4();
                    db.save_attached_file(channel_id, file_id, file_path);
                    ids.push(file_id);
                    console.log(`Upload of '${filename}' finished`);
                });
            });
        }
    })

    req.pipe(req.busboy);
    return res.json({"status":"success", "all_ids":ids});
}

module.exports.get_file = async (req, res) => {
  if(!req.session.userid){
    res.status(401).send('Unauthorized');
    return;
  }
  if(!req.query.channel){
    res.status(400).send('no channel id');
    return;
  }
  if(!req.query.id){
    res.status(400).send('no file id');
    return;
  }
  if(!req.session.channels_joined.includes(req.query.channel)){
    res.status(403).send('no access');
    return;
  }
  
  var filepath = await db.get_attached_file(req.query.channel, req.query.id);
  if(!filepath){
    res.status(200).send('file not found');
  }

  res.status(200).sendFile(filepath, {root:__dirname+"/../"}, (err)=>{
    if(err){
      console.log(err);
    }
  });
}