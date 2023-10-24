const { createClient } = require('redis');
const db = createClient();

db.connect();
db.on("connect", ()=>{
    console.log("Connected to redis db.")
});
db.on('error', err => console.log('Redis Client Error', err));

async function erase(){
    await db.flushAll();
}

async function getstring(key){
    var string = await db.get(key);
    return string;
}

//for saving user account data
async function storeuser(id, username, password, profile_picture="", email){
    await db.set(id, JSON.stringify({"username":username, "password":password, "profile_picture":profile_picture, "email":email}));
    await db.set(email, id);
    await db.set(username, id);
}

async function edituser(id, username, password, profile_picture, email){
    var user = JSON.parse(await getstring(id));
    if(username){user.username=username}
    if(password){user.password=password}
    if(profile_picture){user.profile_picture=profile_picture}
    if(email){user.email=email};
    await db.set(id, JSON.stringify(user));
}

//for saving and retrieving user messages
async function savemessage(userid, channel, msgid, timestamp, content){
    await db.rPush(channel, JSON.stringify({"sender":userid, "msgid":msgid, "timestamp":timestamp, "content":content}));
}
async function readtext(channel_id, startidx = 0, endidx = -1){
    var everything = await db.lRange(channel_id,startidx,endidx);
    return everything;
}
//get how many messages are in the channel
async function getlength(channel_id){
    var length = await db.lLen(channel_id);
    return length;
}

async function createchannel(id, name, owner_id){
    await db.set("channel:"+id, JSON.stringify({"name": name, "owner": owner_id}));
}
async function addchannel_to_user(userid, channel_id){
    //await db.rPush(userid+":joinedchannels", JSON.stringify({"channel_id": channel_id, "channel_name": channel_name}));
    await db.SADD(userid+":joinedchannelset", channel_id);
    await db.SADD("channel:"+channel_id+":accessset", userid);
}
async function listchannels(userid){
    var list = await db.SMEMBERS(userid+":joinedchannelset");
    return list;
}
async function check_joined_channel(user_id, channel_id){
    var result = await db.SISMEMBER(user_id+":joinedchannelset", channel_id);
    return result;
}

async function store_invite_code(code, channelid, expire_date){
    await db.set(`invitecode:${code}`, JSON.stringify({channel: channelid, expires: expire_date}));
}
async function get_invite_channel(code){
    var invite = await db.get(`invitecode:${code}`);
    if(!invite){
        console.log("nahhh");
        return false;
    }

    invite = JSON.parse(invite);

    var channel = await get_channel_by_id(invite.channel);
    return [invite.channel, invite.expires, channel];
}
async function delete_invite_code(code){
    await db.del(code);
}
async function get_member_list(channel_id){
    var list = await db.SMEMBERS("channel:"+channel_id+":accessset");
    return list
}
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

async function get_channel_by_id(channel_id){
    var channel = JSON.parse(await db.get("channel:"+channel_id));
    return channel;
}

async function save_attached_file(channel_id, file_id, file_path){
    await db.set(`uploadedFilePaths:${channel_id}:${file_id}`, file_path);
}
async function get_attached_file(channel_id, file_id){
    var file_path = await db.get(`uploadedFilePaths:${channel_id}:${file_id}`);
    return file_path;
}

module.exports = {
    erase:erase,
    getstring:getstring,
    storeuser:storeuser,
    savemessage:savemessage,
    readtext:readtext,
    getlength:getlength,
    createchannel:createchannel,
    addchannel_to_user:addchannel_to_user,
    listchannels:listchannels,
    check_joined_channel:check_joined_channel,
    store_invite_code:store_invite_code,
    get_invite_channel:get_invite_channel,
    delete_invite_code:delete_invite_code,
    get_member_list:get_member_list,
    ban_user_from_channel:ban_user_from_channel,
    unban_user_from_channel:unban_user_from_channel,
    check_ban:check_ban,
    get_all_banned:get_all_banned,
    get_channel_by_id:get_channel_by_id,
    save_attached_file:save_attached_file,
    get_attached_file:get_attached_file,
    edituser:edituser
}