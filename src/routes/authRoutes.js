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

router.post("/v1/signup", signup);
router.post("/v1/verify-otp", verifyOtp);
router.post("/v1/signin", signIn);
router.post("/v1/resend-otp", resendOtp);
router.post("/v1/forgot-password", forgotPassword);
router.post("/v1/verify-forgot-otp", verifyForgotOtp);
router.post("/v1/resend-forgot-otp", resendForgotOtp);
router.post("/v1/new-password", newPassword);
router.post("/v1/upload-profile-image", authMiddleware, uploadProfileImage);
router.patch("/v1/user/profile", authMiddleware, updateUserProfile);
router.post("/v1/delete-user", deleteUser);

module.exports = router;
