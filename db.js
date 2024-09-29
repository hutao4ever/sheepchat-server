const { createClient,commandOptions } = require('redis');//cache db
const maindb = require('./mysql_db');
const { syncFile } = require('./sync');
const db = createClient();

const common_expiration = 60*60*24;

db.connect();
db.on("connect", ()=>{
    console.log("Connected to redis db.");
});
db.on('error', err => console.log('Redis Client Error', err));

async function user_lookup(identifier, cache = true){
    var user = await maindb.find_user(identifier);
    
    if(user.length == 0){
        return false;
    }
    user = user[0];
    if(!user.profile_pic){
        user.profile_pic = "";//prevent null value in the object, it causes redis error
    }
    if(cache){
        await db.hSet(commandOptions({NX:true}), 'user:'+user.ID, user);
        await db.expire(commandOptions({GT:true}),'user:'+user.ID, common_expiration);
    }
    return user;
}

async function user(ID){
    var user = await db.hGetAll('user:'+ID);
    if(!user.__proto__){
        user = await maindb.get_user_by_id(ID);
    }
    return user;
}

//for saving user account data
async function storeuser(id, username, password, profile_picture="", email){
    const userobject = {"ID":id, "username":username, "password":password, "profile_picture":profile_picture, "email":email};
    await maindb.add_user(userobject);
}

async function edituser(id, username, password, profile_picture, email){
    var user_ = await user(id);
    if(username){user_.username=username;}
    if(password){user_.password=password}
    if(profile_picture){user_.profile_pic=profile_picture}
    if(email){user_.email=email};
    
    await db.hSet('user:'+user_.ID, user_);
    await db.expire(commandOptions({GT:true}),'user:'+user_.ID, common_expiration);
    await maindb.update_user(user_);
}

//for saving, deleting and retrieving user messages
async function savemessage(userid, channel, msgid, timestamp, content){
    const messageobject = {"channel":channel,"sender":userid, "msgid":msgid, "timestamp":timestamp, "content":content};
    //await db.hSet(msgid, messageobject);
    await maindb.store_message(messageobject);
}
async function getmessagebulk(channel_id, startidx, length){
    const messages = await maindb.get_messages(channel_id, startidx, length);
    return messages;
}
async function get_message_by_id(msgid){
    const message = await maindb.get_message(msgid);
    return message;
}
async function deletemessage(msgid){
    await maindb.delete_message(msgid);
}
async function getlength(channel_id){
    //get how many messages are in the channel
    var length = await db.lLen(channel_id);
    return length;
}

//user list, join, create channel functions
async function createchannel(id, name, owner_id){
    await maindb.add_channel({'id':id,'name':name,'owner':owner_id,"icon":""});
}
async function deletechannel(id){
    return await maindb.transaction(async()=>{
        await maindb.delete_channel_record(id);
        await maindb.delete_all_message_from_channel(id);
    });
}
async function get_channel_by_id(channel_id){
    var channel = await db.hGetAll("channel:"+channel_id);
    
    if(!channel.__proto__){
        channel = await maindb.get_channel(channel_id);
        if(!channel.icon){
            channel.icon = "";
        }
        if(channel){
            db.hSet("channel:"+channel_id, channel);
            db.expire(commandOptions({GT:true}), "channel:"+channel_id, common_expiration);
        }
    }
    
    return channel;
}
async function editchannel(id, name, icon){
    var channel = await maindb.get_channel(id);
    if(name){channel.name = name}
    if(icon){channel.icon = icon}
    db.hSet("channel:"+id, channel);
    db.expire(commandOptions({GT:true}), "channel:"+id, common_expiration);
    await maindb.update_channelinfo(channel);
}
async function add_channel_to_user(userid, channel_id){
    var user_joinedchannels = await maindb.get_joinedchannels(userid);
    if(!user_joinedchannels){
        user_joinedchannels = [channel_id];
    }else{
        user_joinedchannels = JSON.parse(user_joinedchannels);
        user_joinedchannels.push(channel_id);
    }

    var channel_memberslist = await maindb.get_channel(channel_id).members;
    if(!channel_memberslist){
        channel_memberslist = [userid];
    }else{
        channel_memberslist = JSON.parse(channel_memberslist);
        channel_memberslist.push(userid);
    }
    maindb.transaction(async ()=>{
        await maindb.update_joinedchannels(userid, user_joinedchannels, true);
        await maindb.update_channelmembers(channel_id, channel_memberslist, true);
    });
}
async function remove_channel_from_user(userid, channel_id, exclude_channel=false){
    var user_joinedchannels = await maindb.get_joinedchannels(userid);
    
    user_joinedchannels = JSON.parse(user_joinedchannels);
    for(var i=0;i<user_joinedchannels.length;i++){
        if(user_joinedchannels[i] == channel_id){
            user_joinedchannels.splice(i,1);
        }
    }
    
    if(!exclude_channel){
        var channel_memberslist = await maindb.get_channel(channel_id).members;
        
        channel_memberslist = JSON.parse(channel_memberslist);
        for(var i=0;i<channel_memberslist.length;i++){
            if(channel_memberslist[i] == userid){
                channel_memberslist.splice(i,1);
            }
        }
        
        maindb.transaction(async ()=>{
            await maindb.update_joinedchannels(userid, user_joinedchannels, true);
            await maindb.update_channelmembers(channel_id, channel_memberslist, true);
        });
    }else{
        await maindb.update_joinedchannels(userid, user_joinedchannels, true);
    }
}
async function listchannels(userid){
    list = await maindb.get_joinedchannels(userid);
    if(!list){
        list = [];
    }else{
        list = JSON.parse(list);
    }
        
    return list;
}

async function store_invite_code(code, channelid, expire){
    /*await db.set(`invitecode:${code}`, channelid);
    await db.expire(`invitecode:${code}`, expire);*/
    maindb.store_invite_code(code, channelid, expire);
}
async function get_invite_channel(code){
    const invitation = await maindb.get_invite_code(code);
    if(invitation){
        if(parseInt(invitation.expiration) < Math.floor(Date.now() / 1000)){
            await maindb.delete_invite_code(code);
            return false;
        }
        return invitation.channel_id;
    }
    return false;
}

async function get_member_list(channel_id){
    const channel = await get_channel_by_id(channel_id);
    return JSON.parse(channel.members);
}

//channel admin functions
async function ban_user_from_channel(channel_id, user_id){
    await db.SADD("channel:"+channel_id+":banlist", user_id);
    await db.SREM("channel:"+channel_id+":accessset", user_id);
    await db.SREM(user_id+":joinedchannelset", channel_id);
}
async function unban_user_from_channel(channel_id, user_id){
    await db.SREM("channel:"+channel_id+":banlist", user_id);
}
async function get_all_banned(channel_id){
    var result = db.SMEMBERS("channel:"+channel_id+":banlist");
    return result;
}
async function check_ban(channel_id, user_id){
    var result = db.SISMEMBER("channel:"+channel_id+":banlist", user_id);
    return result;
}

//chat send file functions 
async function save_attached_file(file_id, file_path){
    await maindb.store_filepath(file_id, file_path);
    await db.set(`uploadedFilePaths:${file_id}`, file_path);
    await db.expire(`uploadedFilePaths:${file_id}`, common_expiration);
    syncFile(file_id, file_path);
}
async function get_attached_file(file_id){
    var file_path = await db.get(`uploadedFilePaths:${file_id}`);
    if(!file_path){
        file_path = await maindb.get_filepath(file_id);
        if(file_path){
            await db.set(`uploadedFilePaths:${file_id}`, file_path);
            await db.expire(`uploadedFilePaths:${file_id}`, common_expiration);
        }
    }
    
    return file_path;
}

module.exports = {
    user_lookup,
    user,
    storeuser,
    savemessage,
    get_message_by_id,
    deletemessage,
    getmessagebulk,
    getlength,
    createchannel,
    deletechannel,
    add_channel_to_user: add_channel_to_user,
    remove_channel_from_user:remove_channel_from_user,
    editchannel,
    listchannels,
    store_invite_code,
    get_invite_channel,
    get_member_list,
    ban_user_from_channel,
    unban_user_from_channel,
    check_ban,
    get_all_banned,
    get_channel_by_id,
    save_attached_file,
    get_attached_file,
    edituser
}