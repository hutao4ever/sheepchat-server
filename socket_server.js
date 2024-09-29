const { Server } = require("socket.io");
const db = require("./db");
const { nanoid } = require('nanoid');
const { jwtsecret } = require("./config/jwtsecret");
const jwt = require("jsonwebtoken");

class ChatServer {
  constructor(httpserver) {
    this.socketserver = new Server(httpserver, {
      cors: {
        origin: "http://localhost:8080"
      }
    });

    this.socketserver.use((socket, next) => {
      if (socket.handshake.query && socket.handshake.query.token) {
        jwt.verify(socket.handshake.query.token, jwtsecret, async function (err, decoded) {
          if (err) { console.log("not verified"); return next(new Error('Unauthorized')) };
          socket.userid = decoded.userid;
          socket.channels_joined = [];

          let channels = await db.listchannels(decoded.userid);
          channels.forEach(channel => {
            socket.channels_joined.push(channel);
            socket.join(channel);
          });

          next();
        });
      } else {
        console.log("no token");
        next(new Error("Unauthorized"));
      }
    });

    this.socketserver.on('connection', async (socket) => {
      const userid = socket.userid;

      console.log("New client connected! socket_id:%s uuid:%s", socket.id, userid);

      socket.on('reload', (data) => {
        console.log("reloading access list.");
        let channels = db.listchannels(userid);

        channels.then((channels) => channels.forEach(channel => {
          socket.channels_joined.push(channel);
          socket.join(channel);
        }));
      });

      socket.on('incoming', (data, callback) => {
        console.log("message: %s is sent by %s.", data, userid);
        try {
          var parsed_data = JSON.parse(data);

          if (!socket.channels_joined.includes(parsed_data[0])) {
            throw new Error("Channel does not exist or isnt joined.");
          }

          const timestamp = new Date().getTime();
          const message_id = nanoid(11);
          db.savemessage(userid, parsed_data[0], message_id, timestamp, parsed_data[1]);

          //broadcast to other clients
          socket.to(parsed_data[0]).emit('message', JSON.stringify({ "channel": parsed_data[0], "sender": userid, "ID": message_id, "timestamp": timestamp, "content": parsed_data[1] }));
          callback({//respond to client
            res: "ok",
            timestamp: timestamp,
            id: message_id
          });
        } catch (error) {
          console.log(error);
          callback({
            res: "fail"
          });
        }
      });

      socket.on('delete', async (data, callback) => {
        console.log("User is trying to delete message: " + data);
        const userid = socket.userid;
        try {
          var parsed_data = JSON.parse(data);
          const message = await db.get_message_by_id(parsed_data[1]);
          if (!message) {
            callback({
              res: "fail"
            });
            return;
          }

          const channel = await db.get_channel_by_id(parsed_data[0]);
          console.log(message);
          if (message.sender != userid && channel.owner != userid) {
            console.log("user has no privilege to delete this message.");
            callback({
              res: "fail"
            });
            return;
          }

          await db.deletemessage(parsed_data[1]);
          socket.to(parsed_data[0]).emit('delete', JSON.stringify({ "channel": parsed_data[0], "msgid": parsed_data[1] }));
          console.log("Successfully deleted message: " + parsed_data[1]);
          callback({
            res: "ok"
          });
        } catch (error) {
          console.log(error);
        }
      });

      socket.on("admaction", async (data, callback) => {
        const userid = socket.userid;
        console.log(`admin action is recieved. user:${userid} action:${data}`);

        try {
          const parsed = JSON.parse(data);
          const channel_id = parsed[0];

          if (!socket.channels_joined.includes(channel_id)) {
            throw new Error("Channel does not exist or isnt joined.");
          }
          const channel = await db.get_channel_by_id(channel_id);
          if (userid !== channel.owner) {
            throw new Error('no privilege');
          }

          if (parsed[1].action == "ban") {
            const all_room_clients = this.socketserver.sockets.adapter.rooms.get(channel_id);

            for (let clientId of all_room_clients) {
              let cli_socket = this.socketserver.sockets.sockets.get(clientId);
              console.log(cli_socket.userid);
              console.log(parsed[1].target);
              if (cli_socket.userid == parsed[1].target) {
                console.log("target match");
                cli_socket.leave(channel_id);
                cli_socket.channels_joined = cli_socket.channels_joined.filter((item) => item !== channel_id);
                cli_socket.emit("ban", channel_id);
                break;
              }
            }
          }
        } catch (e) {
          console.log(e);
        }
      });
    });
  }
}

module.exports = ChatServer;
