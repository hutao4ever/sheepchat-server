const mysql = require("mysql");
const {host, user, password, database} = require("./config/dbcreds");

const conn = mysql.createConnection({
    host,
    user,
    password,
    database
});

conn.connect((err)=>{
    if(err){
        throw err;
    }
    console.log("Connected to mysql db.");
});

module.exports.transaction = (operations=()=>{})=>{
    return new Promise((resolve, reject)=>{
        conn.beginTransaction((err)=>{
            if(err){reject(err)}
            operations().then(()=>{
                conn.commit((err)=>{
                    if(err){
                        return conn.rollback(()=>{
                            reject(err);
                        });
                    }
                    console.log("Transaction completed.");
                    resolve(true);
                })
            });
        })
    });
}

module.exports.any_query = (sql, arguments)=>{
    return new Promise((resolve, reject)=>{
        conn.query(sql, arguments,
        function(err, results, fields){
            if(err){reject(err); return;}
            resolve(results);
        });
    });
}

/*----------------------------------------user-------------------------------------*/
module.exports.get_user_by_id = (id)=>{
    const sql = "SELECT * FROM Users WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [id], function(err, results, fields){
            if(err){throw err}
            if(results.length == 0){
                resolve(false);
            }else{
                resolve(results[0]);
            }
        });
    });
}
 
module.exports.find_user = (identifier)=>{
    const sql = "SELECT * FROM Users WHERE ? IN(username, email)";
    return new Promise(resolve=>{
        conn.query(sql, [identifier], function(err, results, fields){
            if(err){throw err}
            resolve(results);
        });
    });
}

module.exports.add_user = (userobject)=>{
    const sql = "INSERT INTO Users (ID, profile_pic, password, email, username) VALUES (?,?,?,?,?)";
    return new Promise(resolve=>{
        conn.query(sql, [userobject.ID, userobject.profile_pic, userobject.password, userobject.email, userobject.username], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.update_user = (userobject)=>{
    const sql = "UPDATE Users SET profile_pic = ?, password = ?, email = ?, username = ? WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [userobject.profile_pic, userobject.password, userobject.email, userobject.username, userobject.ID], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}
/* ---------------------------------------------channel-----------------------------------------*/
module.exports.add_channel = (channelobject)=>{
    const sql = "INSERT INTO Channels (ID, name, owner, icon, on_server) VALUES (?,?,?,?,?)";
    return new Promise((resolve, reject)=>{
        conn.query(sql, [channelobject.id, channelobject.name, channelobject.owner, channelobject.icon, channelobject.on_server], function(err, results, fields){
            if(err){if(err.code=="ER_DUP_ENTRY"){reject("mysql-add_channel:duplicate")}else{throw err} return;}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.delete_channel_record = (channel_id)=>{
    const sql = "DELETE FROM Channels WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [channel_id], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.get_channel = (channel_id)=>{
    const sql = "SELECT * FROM Channels WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [channel_id], function(err, results, fields){
            if(err){throw err}
            
            if(results.length!=0){
                resolve(results[0]);
            }else{
                resolve(false);
            }
        });
    });
}

module.exports.update_channelinfo = (channel_object)=>{
    const sql = "UPDATE Channels SET name = ?, icon = ? WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [channel_object.name, channel_object.icon, channel_object.ID], function(err, results, fields){
            if(err){
                throw err;
            }
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.update_channelmembers = (channel_id, channelmembers, transaction=false)=>{
    const sql = "UPDATE Channels SET members = ? WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [JSON.stringify(channelmembers), channel_id], function(err, results, fields){
            if(err && transaction){
                conn.rollback(()=>{
                    throw err;
                });
            }
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.get_joinedchannels = (user_id)=>{
    const sql = "SELECT joinedchannels FROM joinedchannels WHERE USERID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [user_id], function(err, results, fields){
            if(err){throw err}
            
            if(results.length == 0){
                resolve(false);
            }else{
                resolve(results[0].joinedchannels);
            }
        });
    });
}

module.exports.update_joinedchannels = (user_id, joinedchannels, transaction=false)=>{
    const sql = "INSERT INTO joinedchannels (USERID, joinedchannels) VALUES (?,?) ON DUPLICATE KEY UPDATE joinedchannels = VALUES(joinedchannels)";
    return new Promise(resolve=>{
        conn.query(sql, [user_id, JSON.stringify(joinedchannels)], function(err, results, fields){
            if(err && transaction){
                return conn.rollback(()=>{
                    throw err;
                });
            }
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.store_invite_code = (code, channel_id, expiration)=>{
    const sql = "INSERT INTO invites (code, channel_id, expiration) VALUES (?,?,?)";
    return new Promise(resolve=>{
        conn.query(sql, [code, channel_id, expiration], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.get_invite_code = (code)=>{
    const sql = "SELECT * FROM invites WHERE code = ?";
    return new Promise(resolve=>{
        conn.query(sql, [code], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            if(results.length == 0){
                resolve(false);
                return;
            }
            resolve(results[0]);
        });
    });
}

module.exports.delete_invite_code = (code)=>{
    const sql = "DELETE FROM invites WHERE code = ?";
    return new Promise(resolve=>{
        conn.query(sql, [code], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            resolve(results);
        });
    });
}
/* ---------------------------------------------message-----------------------------------------*/
module.exports.store_message = (messageobject)=>{
    const sql = "INSERT INTO messages (ID, channel, sender, content, timestamp) VALUES (?,?,?,?,?)";
    return new Promise((resolve,reject)=>{
        conn.query(sql, [messageobject.ID, messageobject.channel, messageobject.sender, JSON.stringify(messageobject.content), messageobject.timestamp], function(err, results, fields){
            if(err){if(err.code=="ER_DUP_ENTRY"){reject("mysql-store_message:duplicate")}else{throw err} return;}
            console.log(results);
            resolve(results);
        });
    });
}

module.exports.get_messages = (channel_id, start, length)=>{
    const sql = "SELECT * FROM messages WHERE channel = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    return new Promise(resolve=>{
        conn.query(sql, [channel_id, length, start], function(err, results, fields){
            if(err){throw err}
            resolve(results);
        });
    });
}

module.exports.get_message = (ID)=>{
    const sql = "SELECT * FROM messages WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [ID], function(err, results, fields){
            if(err){throw err}
            if(results.length == 0){
                resolve(false);
                return;
            }
            resolve(results[0]);
        });
    });
}

module.exports.delete_message = (ID)=>{
    const sql = "DELETE FROM messages WHERE ID = ?";//TODO: instead of deleting the row altogether, just overwrite the content
    return new Promise(resolve=>{
        conn.query(sql, [ID], function(err, results, fields){
            if(err){throw err}
            resolve(results);
        });
    });
}

module.exports.delete_all_message_from_channel = (channel_id)=>{
    const sql = "DELETE FROM messages WHERE channel = ?";
    return new Promise(resolve=>{
        conn.query(sql, [channel_id], function(err, results, fields){
            if(err){throw err}
            resolve(results);
        });
    });
}

module.exports.store_filepath = (fileid, filepath)=>{
    const sql = "INSERT INTO uploaded (ID, path) VALUES (?, ?)";
    return new Promise(resolve=>{
        conn.query(sql, [fileid, filepath], function(err, results, fields){
            if(err){throw err}
            resolve(results);
        });
    });
}

module.exports.get_filepath = (fileid)=>{
    const sql = "SELECT path FROM uploaded WHERE ID = ?";
    return new Promise(resolve=>{
        conn.query(sql, [fileid], function(err, results, fields){
            if(err){throw err}
            console.log(results);
            if(results.length == 0){
                resolve(false);
            }else{
                resolve(results[0].path);
            }
        });
    });
}