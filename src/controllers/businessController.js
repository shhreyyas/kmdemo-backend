const prisma = require("../config/prisma");
const { successResponse, errorResponse } = require("../utils/response");

exports.createBusinessProfile = async (req, res) => {
  try {
    const userId = req.user.userId; // from JWT middleware

    const {
      name,
      owner_name,
      same_as_owner,
      contact_number,
      email,
      address,
      business_types,
      years_experience,
      registration_number,
      gst_number,
      logo_url,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !owner_name ||
      !contact_number ||
      !email ||
      !address ||
      !Array.isArray(business_types) ||
      business_types.length === 0 ||
      years_experience === undefined ||
      !registration_number ||
      !gst_number
    ) {
      return errorResponse(res, "All fields are required", 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const contactPerson = same_as_owner ? owner_name : owner_name;

    const updatedBusiness = await prisma.business.update({
      where: { id: user.businessId },
      data: {
        name,
        ownerName: owner_name,
        contactPerson,
        contactNumber: contact_number,
        email,
        address,
        businessType: business_types,
        yearsExperience: Number(years_experience),
        registrationNumber: registration_number,
        gstNumber: gst_number,
        logoUrl: logo_url || null,
        isProfileCompleted: true,
      },
    });

    return successResponse(
      res,
      "Business profile saved successfully",
      updatedBusiness,
      200,
    );
  } catch (error) {
    console.error("Business profile error:", error.message);
    return errorResponse(res, "Server error", 500);
  }
};
