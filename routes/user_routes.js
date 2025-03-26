const {checkauth, authenticate, logout, editprofilepic, getprofilepic, lookupname, editusername, register, getToken, changepassword} = require("../controllers/user")
const router = require("express").Router()
const {profilepic} = require("../multer")

router.post("/api/auth", authenticate);
router.post("/api/register", register);
router.post("/api/changepfp", profilepic.single('image'), editprofilepic);
router.post("/api/changepwd", changepassword);
router.post("/api/editusrnm", editusername);
router.get("/api/checkauth", checkauth);
router.get("/api/token", getToken);
router.get("/api/getpfp", getprofilepic);
router.get("/api/logout", logout);
router.get("/api/getusername", lookupname);

module.exports = router;