const busboy = require("busboy");
const maindb = require("./mysql_db");
const FormData = require("form-data");
const fs = require("fs");
const {Worker} = require('node:worker_threads');
const {ENABLE} = require("./config/sync");

var handler_incremental_id = 0;

//remote to local handler
module.exports.sync = (req, res)=>{
    if(req.url == "/sync/file" && req.method == "POST"){
        try{
            var bb = busboy({headers:req.headers});
        }catch(e){
            console.log(e);
            res.writeHead(400, { Connection:'close'});
            res.end();
            return;
        }
        
	    function abort(){ 
            req.unpipe(bb);
            if(!req.aborted){ 
                res.writeHead(413, { Connection:'close'});
                res.end();
            }
        }

        bb.on('field', (name, val, info) => {
            console.log(`${new Date().toUTCString()}  Field [${name}]: value: %j`, val);

            if(name == "fileid"){
                bb.on('file', (name, file, info)=>{
                    const {filename, encoding, mimeType} = info;
                    console.log(`File [${name}]: filename: %j, encoding:%j, mimeType: %j`,filename,encoding,mimeType);
        
                    const fsStream = fs.createWriteStream("./uploads/"+filename);
                    file.pipe(fsStream);
                    fsStream.on('close',()=>{
                        console.log(`File [${name}] done`);
                    });
                });
            }
        });

        bb.on('close', () => {
            console.log('Done parsing form!');
            res.writeHead(200, { Connection: 'close'});
            res.end();
        });

        req.on("aborted", abort);
        bb.on("error", abort);
       
        req.pipe(bb);
    }else if(req.url == "/sync/query" && req.method == "POST"){
        var body = "";
        req.on('data', (chunk)=> {
            body += chunk;
        });
        req.on('end', async ()=> {
            console.log(new Date().toUTCString() + "  " + body);
            body = JSON.parse(body);
            var {id, sql, arguments} = body;
            if(id != handler_incremental_id){
                worker.postMessage({"from":"handler", id, sql, arguments});
                console.log("Out of order. expected id:"+handler_incremental_id);
                res.writeHead(200, { Connection: 'close'});
                res.end();
                return;
            }
            handler_incremental_id ++;

            await maindb.any_query(sql, arguments);
            worker.postMessage({"from":"handler", "id":handler_incremental_id});

            res.writeHead(200, { Connection: 'close'});
            res.end();
        });
    }else if(req.url == "/sync/reset"){
        handler_incremental_id = 0;
    }else{
        res.write("invalid\n");
        res.end();
    }
}


//local to remote requests
module.exports.syncFile = async (id, filepath)=>{
    if(ENABLE){
        worker.postMessage({"type":"file", "fileid":id, "file":fs.createReadStream(filepath)});
    }
}

module.exports.syncQuery = async (query, arguments)=>{
    if(ENABLE) worker.postMessage({"type":"query", query, arguments});
}


const worker = new Worker("./sync_worker.js");
worker.on('message', (message)=>handler_incremental_id=message);
worker.on('error', (err)=>{throw err});
worker.on('exit', (code) => {
    if (code !== 0)
        throw new Error(`Worker stopped with exit code ${code}`);
});