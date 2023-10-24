const {createchannel, loadmessage, loadchannels, joinchannel, get_member_list, generate_join_code, ban, unban, get_file, upload_file} = require("../controllers/chat")
const router = require("express").Router()

router.post("/api/createchannel", createchannel);
router.post("/api/getjoincode", generate_join_code);
router.post("/api/joinchannel", joinchannel);
router.post("/api/admin/ban", ban);
router.post("/api/admin/unban", unban);
router.post("/api/uploadimg", upload_file);
router.get("/api/loadmessage", loadmessage);
router.get("/api/getfile", get_file);
router.get("/api/getchannels", loadchannels);
router.get("/api/memberlist", get_member_list);
//router.get("/api/querychannel", channelquery);

module.exports = router;