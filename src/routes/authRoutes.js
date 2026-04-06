const express = require("express");
const router = express.Router();
const {
  signup,
  verifyOtp,
  signIn,
  resendOtp,
  forgotPassword,
  verifyForgotOtp,
  newPassword,
  resendForgotOtp,
  updateUserProfile,
  deleteUser,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadProfileImage } = require("../controllers/uploadController");

router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/signin", signIn);
router.post("/resend-otp", resendOtp);
router.post("/forgot-password", forgotPassword);
router.post("/verify-forgot-otp", verifyForgotOtp);
router.post("/resend-forgot-otp", resendForgotOtp);
router.post("/new-password", newPassword);
router.post("/v1/upload-profile-image", authMiddleware, uploadProfileImage);
router.patch("/user/profile", authMiddleware, updateUserProfile);
router.post("/delete-user", deleteUser);

module.exports = router;
