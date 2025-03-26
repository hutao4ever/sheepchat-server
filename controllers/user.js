const uuid = require("uuid")
const db = require("../db")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const {jwtsecret} = require("../config/jwtsecret")
const fs = require("fs")
const path = require("path")

module.exports.checkauth = (req, res) => {
    const time_millisec = Date.now();
    if(req.query.timestamp){
        try{
            const time_start_millisec = parseInt(req.query.timestamp);
            var latency = time_millisec - time_start_millisec;
        }catch(e){}
    }

    if(req.session.userid){
        return res.status(200).json({"status":"success", "username":req.session.username, "latency":latency});
    }else{
        return res.status(403).send({"status":"noauth", "latency":latency});
    }
}

module.exports.getToken = (req, res) => {
    if(req.session.userid){
        return res.status(200).json({"status":"success", "username":req.session.username, "token":req.session.token});
    }else{
        return res.status(403).send({"status":"unauthorized"});
    }
}

module.exports.authenticate = async (req, res) => {
    const {username, password} = req.body;
    if(!username || !password){
        return res.status(400).send("invalid");
    }
    
    const user = await db.user_lookup(username);
    if(!user){
        console.log("not authenticated");
        return res.status(200).send({"status":"non-authenticated"});
    }

    const password_validity = await bcrypt.compare(password, user.password);
    if(!password_validity){
        console.log("not authenticated");
        return res.status(200).send({"status":"non-authenticated"});
    }

    const token = jwt.sign({userid:user.ID, username:user.username}, jwtsecret, {expiresIn:'24h'}); 

    console.log("user data read. username:%s id:%s", username, user.ID);
    req.session.userid = user.ID;
    req.session.username = user.username;
    req.session.token = token;
    req.session.channels_joined = [];
    
    console.log("New session created for user: %s, user id is %s",username, user.ID);
    return res.status(200).json({"status":"success", "username":user.username, "ID":user.ID, "token":token});
}

module.exports.renew_token = (req, username)=>{
    var token = jwt.sign({userid:req.session.userid, username:username?username:req.session.username}, jwtsecret, {expiresIn:'24h'});
    req.session.token = token;
    return token;
}

module.exports.register = async (req, res) => {
    const {username, email, password} = req.body;
    if(!username || !email || !password){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }
    if(username.length < 2 || username.length > 25 || username.includes("#")){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }
    if(!email.toLowerCase().match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }
    if(password.length < 8 || password.length > 64){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }

    console.log(`New user registering.`)

    const email_existence = await db.user_lookup(email, false);
    if(email_existence){
        return res.status(200).json({"status":"fail","error":"used email"});
    }

    var conflict_stat = true;
    for(let i = 0; i < 6; i++){//try 6 times for a unique suffix
        let suffix = Math.floor(1000 + Math.random() * 9000);
        var username_ = username.trim()+"#"+suffix;
        const conflict = await db.user_lookup(username, false);//check for conflicting username 
        if(!conflict){
            conflict_stat = false;
            break;
        }
    }
    if(conflict_stat){
        return res.status(200).json({"status":"fail", "error":"not unique"});
    }

    //hash password
    var salt = await bcrypt.genSalt();
    var hash = await bcrypt.hash(password, salt);

    const userid = uuid.v4();
    console.log(`username:${username_} userid:${userid}`);

    await db.storeuser(userid, username_, hash, "", email);

    return res.status(200).json({"status":"success", "username":username_});
}

module.exports.editprofilepic = async (req, res) => {
    if (!req.file || req.file.length === 0) {
        return res.status(400);
    }
    console.log(`User ${req.session.userid} is changing profile picture.`);
    console.log(req.file.path);
    await db.edituser(req.session.userid, null, null, req.file.path, null);
    return res.status(200).send("ok");
}

module.exports.getprofilepic = async (req, res) => {
    var user = null;
    
    if(req.query.userid){
        user = await db.user(req.query.userid);
    }else if(req.session.userid){
        user = await db.user(req.session.userid);
    }

    if(!user){
        return res.status(400).send("Invalid request.");
    }
    
    if(user.profile_pic){
        fs.stat(path.join(__dirname,"/../",user.profile_pic), (err,stat)=>{
            if(err==null){
                res.status(200).sendFile(user.profile_pic, {root:__dirname+"/../"}, (err)=>{
                    console.log(err);
                });
            }else if(err.code=="ENOENT"){
                res.status(200).sendFile("profilepics/placeholder.png", {root:__dirname+"/../"}, (err)=>{
                    if(err){
                        console.log(err);
                    }
                });
            }
        })
    }else{
        res.status(200).sendFile("profilepics/placeholder.png", {root:__dirname+"/../"}, (err)=>{
            if(err){
                console.log(err);
            }
        });
    }
}

module.exports.changepassword = async (req, res) => {
    if(!req.session.userid){
        return res.status(401).send("Unauthorized");
    }
    const {password_old, password_new} = req.body;
    if(!password_old || !password_new){
        return res.status(400).send("invalid");
    }
    if(password_new.length < 8 || password_new.length > 64){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }
    
    const user = await db.user(req.session.userid);
    console.log("user %s is trying to change password!", user.ID);

    const password_validity = await bcrypt.compare(password_old, user.password);
    if(!password_validity){
        console.log("Old password mismatch");
        return res.status(200).send({"status":"fail", "error":"mismatch"});
    }
    var salt = await bcrypt.genSalt();
    var hash = await bcrypt.hash(password_new, salt);
    await db.edituser(user.ID, null, hash, null, null);
    return res.status(200).send({"status":"success"});
}

module.exports.editusername = async (req, res) => {
    if(!req.session.userid){
        return res.status(401).send("Unauthorized");
    }
    const {username} = req.body;
    
    if(username.length < 2 || username.length > 25 || username.includes("#")){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }

    var conflict_stat = true;
    for(let i = 0; i < 6; i++){//try 6 times for a unique suffix
        let suffix = Math.floor(1000 + Math.random() * 9000);
        var username_ = username.trim()+"#"+suffix;
        const conflict = await db.user_lookup(username, false);//check for conflicting username 
        if(!conflict){
            conflict_stat = false;
            break;
        }
    }
    if(conflict_stat){
        return res.status(200).json({"status":"fail", "error":"not unique"});
    }

    console.log(req.session.userid+" username change:"+username_);

    await db.edituser(req.session.userid, username_, null, null, null);
    req.session.username = username_;
    return res.status(200).json({"status":"success", "username":username_});
}

module.exports.lookupname = async (req, res) => {
    if(!req.query.userid){
        return res.status(400).send("invalid");
    }

    var user = await db.user(req.query.userid);

    if(user){
        return res.status(200).send(user.username);
    }

    user = await req.query_user(req.query.userid);

    if(user){
        return res.status(200).send(user.username);
    }
     
    return res.status(200).send("none");
} 

module.exports.logout = (req, res) => {
    if(req.session.userid){
        req.session.userid = undefined;
        req.session.destroy();
    }
    return res.status(200).send("ok");
}
