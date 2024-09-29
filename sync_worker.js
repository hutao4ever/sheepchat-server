const {parentPort} = require('node:worker_threads');
const {remote_servers} = require('./config/sync');
const fs = require('node:fs');
var queue = []; //if network error happens, request is added to the queue and tried again later
var incremental_id = 0;

var handler_queue = {};//if request arrive out of order, it is added to this

const logfile_outgoing = "./sync_out.log";
const logfile_incoming = "./sync_in.log";

console.log("Sync worker: worker has been started.");

async function make_request(data){
    if(data.type == "file"){
        const formdata = new FormData();
        formdata.append('fileid',data.fileid);
        formdata.append('file',data.file);
        fs.writeFileSync(logfile_outgoing, `${new Date().toUTCString}    /file    ${JSON.stringify(formdata)} \n`, {flag:'a'});
        try{
            const response = await fetch(`http://${remote_servers[0]}/sync/file`, {method:"POST", body: JSON.stringify(formdata)});
            if(response.status !== 200){
                fs.writeFileSync(logfile_outgoing, `request failed (remote server error) \n`, {flag:'a'});
                throw new Error("Sync worker: remote server failed to process request.");
            }
        }catch(e){
            fs.writeFileSync(logfile_outgoing, `request failed \n`, {flag:'a'});
            console.log("Sync worker: network error encountered.");
            console.log(e);
            return false;
        }
    }else if(data.type == "query"){
        let data = {"id":data.id, "sql":data.query, "arguments":data.arguments};
        fs.writeFileSync(logfile_outgoing, `${new Date().toUTCString}    /query    ${JSON.stringify(data)} \n`, {flag:'a'});
        try{
            const response = await fetch(`http://${remote_servers[0]}/sync/query`, {method:"POST", body: JSON.stringify(data)});
            if(response.status !== 200){
                fs.writeFileSync(logfile_outgoing, `request failed (remote server error) \n`, {flag:'a'});
                throw new Error("Sync worker: remote server failed to process request.");
            }
        }catch(e){
            fs.writeFileSync(logfile_outgoing, `request failed \n`, {flag:'a'});
            console.log("Sync worker: network error encountered.");
            console.log(e);
            return false;
        }
    }
    return true;
}

parentPort.on('message', (item)=>{
    //incoming process
    if(item.from == "handler"){
        if(!item.sql){
            let id = item.id;
            while(id in handler_queue){
                console.log("next request found in queue(id):"+handler_incremental_id);
                //fs.writeFileSync()
                maindb.any_query(...handler_queue[handler_incremental_id]);
                id ++;
            }
            parentPort.postMessage(id);
            return;
        }
        handler_queue[item.id] = item;
        return;
    }

    //outgoing process
    item.id = incremental_id;
    make_request(item).then((result)=>{
        if(!result){
            queue.push(item);
        }
    });
    if(item.type != "file"){
        incremental_id ++;
    }
});

setTimeout(async function process_queue(){
    for(var i=queue.length-1; i>-1; i--){
        if(!await make_request(queue[i])){
            break;
        }else{
            queue.splice(i, 1);
        }
    }
    setTimeout(process_queue,3000);
},3000);