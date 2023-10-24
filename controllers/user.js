const uuid = require("uuid")
const db = require("../db")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const {jwtsecret} = require("../config/jwtsecret")

module.exports.checkauth = (req, res) => {
    if(req.session.userid){
        return res.status(200).json({"status":"success", "username":req.session.username});
    }else{
        return res.status(403).send({"status":"noauth"});
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
    
    const userid = await db.getstring(username);
    if(!userid){
        console.log("not authenticated");
        return res.status(200).send({"status":"non-authenticated"});
    }

    const user = JSON.parse(await db.getstring(userid));

    const password_validity = await bcrypt.compare(password, user.password);
    if(!password_validity){
        console.log("not authenticated");
        return res.status(200).send({"status":"non-authenticated"});
    }

    let channels_joined = await db.listchannels(userid);
    req.session.channels_joined = [];
    channels_joined.forEach(channel => {
        req.session.channels_joined.push(channel);
    });

    const token = jwt.sign({userid:userid, username:user.username}, jwtsecret, {expiresIn:'24h'}); 

    console.log("user data read. username:%s id:%s", username, userid);
    req.session.userid = userid;
    req.session.username = user.username;
    req.session.token = token;
    
    console.log("New session created for user: %s, user id is %s",username,userid);
    return res.status(200).json({"status":"success", "username":user.username, "token":token});
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

    const email_existence = await db.getstring(email);
    if(email_existence){
        return res.status(200).json({"status":"fail","error":"used email"});
    }

    var conflict_stat = true;
    for(let i = 0; i < 6; i++){//try 6 times for a unique suffix
        let suffix = Math.floor(1000 + Math.random() * 9000);
        var username_ = username.trim()+"#"+suffix;
        const conflict = await db.getstring(username);//check for conflicting username 
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
        return res.status(400).send('No file uploaded.');
    }
    console.log(`User ${req.session.userid} is changing profile picture.`);
    console.log(req.file.path);
    await db.edituser(req.session.userid, null, null, req.file.path, null);
    return res.status(200).json({"status":"success"});
}

module.exports.getprofilepic = async (req, res) => {
    var user = null;
    if(req.query.userid){
        user = JSON.parse(await db.getstring(req.query.userid));
    }
    if(!user){
        if(req.session.userid){
            user = JSON.parse(await db.getstring(req.session.userid)); 
        }else{
            return res.status(400).send('invalid');
        }      
    }
    
    if(user.profile_picture !== ""){
        res.status(200).sendFile(user.profile_picture, {root:__dirname+"/../"}, (err)=>{
            if(err){
                console.log(err);
            }
        });
    }else{
        console.log("notfound");
        res.status(200).sendFile("uploads/placeholderpfp.webp", {root:__dirname+"/../"}, (err)=>{
            if(err){
                console.log(err);
            }
        });
    }
}

module.exports.editusername = async (req, res) => {
    if(!req.session.userid){
        return res.status(401).send("Unauthorized");
    }
    const {username} = req.body;
    console.log(username);
    if(username.length < 2 || username.length > 25 || username.includes("#")){
        return req.status(400).json({"status":"fail","error":"invalid"});
    }

    var conflict_stat = true;
    for(let i = 0; i < 6; i++){//try 6 times for a unique suffix
        let suffix = Math.floor(1000 + Math.random() * 9000);
        var username_ = username.trim()+"#"+suffix;
        const conflict = await db.getstring(username);//check for conflicting username 
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
    if(!req.session.userid){
        return res.status(401).send("Unauthorized");
    }
    if(!req.query.userid){
        return res.status(400).send("no user id");
    }
    user = JSON.parse(await db.getstring(req.query.userid));
    if(user){
        return res.status(200).send(user.username);
    }else{
        return res.status(200).send("user not found");
    }
} 

module.exports.logout = (req, res) => {
    if(req.session.userid){
        req.session.destroy();
    }
    return res.status(200).send("ok");
}
