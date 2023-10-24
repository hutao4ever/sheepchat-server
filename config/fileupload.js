const multer = require('multer');
const path = require('path');
//const createError = require('http-errors');

// Configure multer to handle file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

module.exports.upload = multer({ 
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB in bytes
  },
  fileFilter: (req, file, cb) => {
    /*
    if(!req.session.userid){
      cb(createError(401, "Unauthorized"));
    }
    if(!req.body.channel_id){
      cb(createError(200, "no channel id"));
    }
    if(!req.session.channels_joined.includes(req.body.channel_id)){
      cb(createError(403, "no access"));
    }*/
    cb(null, true);
  }
, });

module.exports.profilepic = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB in bytes
  },
  fileFilter: (req, file, cb) => {
    if(!req.session.userid){
      cb(createError(401, "Unauthorized"));
    }
    cb(null, true);
  }
, });
