const {checkauth, authenticate, logout, editprofilepic, getprofilepic, lookupname, editusername, register, getToken} = require("../controllers/user")
const {profilepic} = require("../config/fileupload")
const router = require("express").Router()

router.post("/api/auth", authenticate);
router.post("/api/register", register);
router.post("/api/changepfp", profilepic.single('image'), editprofilepic);
router.post("/api/editusrnm", editusername);
router.get("/api/checkauth", checkauth);
router.get("/api/token", getToken);
router.get("/api/getpfp", getprofilepic);
router.get("/api/logout", logout);
router.get("/api/findusrname", lookupname);

module.exports = router;