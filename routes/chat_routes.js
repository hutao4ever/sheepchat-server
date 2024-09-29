const {createchannel, loadmessage, loadchannels, joinchannel, get_member_list, generate_join_code, ban, unban, get_file, upload_file, change_channel_icon, get_channel_icon, change_channel_name, deletechannel} = require("../controllers/chat")
const router = require("express").Router()
const {channel_icon} = require("../multer");

router.post("/api/createchannel", createchannel);
router.post("/api/getjoincode", generate_join_code);
router.post("/api/joinchannel", joinchannel);
router.post("/api/admin/delete", deletechannel);
router.post("/api/admin/ban", ban);
router.post("/api/admin/unban", unban);
router.post("/api/admin/changeicon", channel_icon.single('image'), change_channel_icon);
router.post("/api/admin/changename", change_channel_name);
router.post("/api/uploadimg", upload_file);
router.get("/api/loadmessage", loadmessage);
router.get("/api/getfile", get_file);
router.get("/api/getchannels", loadchannels);
router.get("/api/geticon", get_channel_icon);
router.get("/api/memberlist", get_member_list);
//router.get("/api/querychannel", channelquery);

module.exports = router;