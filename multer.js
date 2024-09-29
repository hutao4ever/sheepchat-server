const multer = require('multer');
const path = require('path');
const { profilepic_path, profilepic_max_size, channelicon_path, channelicon_max_size } = require('./config/fileupload');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if(req.url=="/api/changepfp"){
      cb(null, profilepic_path);
    }else if(req.url=="/api/admin/changeicon"){
      cb(null, channelicon_path);
    }
  },
  filename: (req, file, cb) => {
    const name = 'profile' + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, name + path.extname(file.originalname));
  }
});

module.exports.profilepic = multer({ 
    storage,
    limits: {
      fileSize: profilepic_max_size,
    },
    fileFilter: (req, file, cb) => {
      if(!req.session.userid){
        cb("err");
      }
      cb(null, true);
    }
});

module.exports.channel_icon = multer({ 
  storage,
  limits: {
    fileSize: channelicon_max_size,
  },
  fileFilter: (req, file, cb) => {
    if(!req.session.userid){
      cb("err");
    }
    
    cb(null, true);
  }
});
  