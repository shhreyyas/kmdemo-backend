# Auth & Business Registration — API Documentation

> **Note:** `license_code` has been removed from all endpoints across the project.

---

## Table of Contents

1. [Sign Up](#1-sign-up)
2. [Verify OTP](#2-verify-otp)
3. [Resend OTP](#3-resend-otp)
4. [Forgot Password](#4-forgot-password)
5. [Sign In](#5-sign-in)
6. [Register Business](#6-register-business) // new 
7. [Get Service Types](#7-get-service-types) // new 

---

## 1. Sign Up

Registers a new user. On successful registration, an OTP is sent to the provided email address for verification.

**Endpoint:** `POST /signup`

**Request Body:**

```json
{
  "name": "Slay Taylor",
  "email": "slay430@yopmail.com",
  "contact": "9876543210",
  "password": "Test@123",
  "device_type": 1,
  "fcm_token": "1234"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "token": "<jwt_token>",
    "user": {
      "id": "cc28aad9-37ce-4aa3-9d9b-4f077b9abbcb",
      "name": "Slay Taylor",
      "email": "slay430@yopmail.com",
      "contact": "9876543210",
      "profile_pic": null,
      "status": 0,
      "user_type": 1,
      "notification_status": 1,
      "email_verified_at": null,
      "device_type": 1,
      "fcm_token": "1234",
      "created_at": "2026-04-01T08:20:35.947Z",
      "updated_at": "2026-04-01T08:20:35.947Z",
      "deleted_at": null
    }
  }
}
```

**Error Response — `4xx`:**

> All failed responses follow this standard structure.

```json
{
  "success": false,
  "message": "User registration failed.",
  "error": {
    "code": "USER_EXISTS",
    "message": "Email already registered."
  }
}
```

---

## 2. Verify OTP

Verifies the OTP sent to the user's registered email. OTPs expire after **2 minutes**.

**Endpoint:** `POST /verify-otp`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com",
  "otp": "411914"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "token": "<jwt_token>",
    "user": {
      "id": "cc28aad9-37ce-4aa3-9d9b-4f077b9abbcb",
      "name": "Slay Taylor",
      "email": "slay430@yopmail.com",
      "contact": "9876543210",
      "profile_pic": null,
      "status": 0,
      "user_type": 1,
      "notification_status": 1,
      "user_verified_at": "2026-04-01T09:04:17.290Z",
      "device_type": 1,
      "fcm_token": "1234",
      "created_at": "2026-04-01T08:20:35.947Z",
      "updated_at": "2026-04-01T08:20:35.947Z",
      "deleted_at": null
    }
  }
}
```

---

## 3. Resend OTP

Resends a fresh OTP to the user's registered email. **The previously issued OTP is immediately invalidated** upon resend.

### 3a. Resend Registration OTP

**Endpoint:** `POST /resend-otp`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": null
}
```

---

## 4. Forgot Password

A 3-step flow that allows users to reset their password via OTP verification.

### Step 1 — Request OTP

**Endpoint:** `POST /forgot-password`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OTP sent to email",
  "data": null
}
```

---

### Step 2 — Verify OTP

**Endpoint:** `POST /verify-forgot-otp`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com",
  "otp": "498943"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OTP verified",
  "data": null
}
```

---

### Step 2a — Resend Forgot Password OTP *(optional)*

If the OTP expires before verification, the user can request a new one. The old OTP is invalidated on resend.

**Endpoint:** `POST /resend-forgot-otp`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": null
}
```

---

### Step 3 — Set New Password

**Endpoint:** `POST /new-password`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com",
  "password": "Test@123",
  "password_confirmation": "Test@123"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": null
}
```

---

## 5. Sign In

Authenticates an existing user. If the user has registered a business, its details are included in the response; otherwise `business_details` returns an empty array.

**Endpoint:** `POST /signin`

**Request Body:**

```json
{
  "email": "slay430@yopmail.com",
  "password": "Test@123",
  "device_type": 1,
  "fcm_token": "abcd123"
}
```

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt_token>",
    "user": {
      "id": "cc28aad9-37ce-4aa3-9d9b-4f077b9abbcb",
      "name": "Slay Taylor",
      "email": "slay430@yopmail.com",
      "contact": "9876543210",
      "status": 1,
      "notification_status": 1,
      "user_verified_at": "2026-04-01T09:04:17.290Z",
      "device_type": 1,
      "fcm_token": "abcd123",
      "business_details": [],
      "created_at": "2026-04-01T08:20:35.947Z",
      "updated_at": "2026-04-01T09:04:17.290Z",
      "deleted_at": null
    }
  }
}
```

> `business_details` will be `[]` if the user has not yet registered a business.

---

## 6. Register Business

Allows an authenticated user to register a business. Currently, each user can register **one business**; support for multiple businesses per user is planned for a future release.

**Subscription Behaviour:**
- Every newly registered business receives a **30-day free trial** automatically.
- After the trial period, the user must purchase a paid plan: **1 Month (1M)**, **6 Months (6M)**, or **12 Months (12M)**.
- `is_trial_used` is set to `true` once the trial period has ended.

> **Internal:** `created_by` must be set from the authenticated user's ID when inserting into the database.

**Endpoint:** `POST /v1/registerBusiness`  
**Auth:** Required — Bearer token in `Authorization` header.

**Request Body:**

```json
{
  "business_logo": "https://example.com/logo.png",
  "business_name": "Karan Caters",
  "business_owner_name": "Karan Pandya",
  "same_as_owner_number": true,
  "contact_number": "9874445556",
  "business_email": "",
  "business_address": "123, MG Road, Surat",
  "service_types": ["wedding", "corporate", "birthday"],
  "catering_types": ["veg", "non_veg"],
  "years_of_experience": 1,
  "business_register_number": "abcd123",
  "gst_number": ""
}
```

**Field Notes:**

| Field | Required | Notes |
|---|---|---|
| `business_logo` | Yes | URL or upload path |
| `business_name` | Yes | |
| `business_owner_name` | Yes | |
| `same_as_owner_number` | No | If `true`, uses user's contact number |
| `contact_number` | Yes | |
| `business_email` | No | |
| `business_address` | Yes | |
| `service_types` | Yes | Multi-select; use slugs from `/v1/getservicetypes` |
| `catering_types` | Yes | Multi-select: `veg`, `non_veg` |
| `years_of_experience` | Yes | Integer |
| `business_register_number` | No | |
| `gst_number` | No | |

**Success Response — `201 Created`:**

```json
{
  "success": true,
  "message": "Business registered successfully",
  "data": {
    "token": "<jwt_token>",
    "user": {
      "id": "cc28aad9-37ce-4aa3-9d9b-4f077b9abbcb",
      "name": "Slay Taylor",
      "email": "slay430@yopmail.com",
      "contact": "9876543210",
      "status": 1,
      "notification_status": 1,
      "user_verified_at": "2026-04-01T09:04:17.290Z",
      "device_type": 1,
      "fcm_token": "abcd123",
      "business_details": [
        {
          "id": "1",
          "business_logo": "https://example.com/logo.png",
          "business_name": "Karan Caters",
          "business_owner_name": "Karan Pandya",
          "same_as_owner_number": true,
          "contact_number": "9874445556",
          "business_email": "",
          "business_address": "123, MG Road, Surat",
          "service_types": ["wedding", "corporate", "birthday"],
          "catering_types": ["veg", "non_veg"],
          "years_of_experience": 1,
          "business_register_number": "abcd123",
          "gst_number": "",
          "subscription": {
            "status": "trial",
            "plan": "FREE",
            "start": "2026-04-01T09:04:17.290Z",
            "end": "2026-05-01T08:20:35.947Z"
          },
          "is_trial_used": false
        }
      ],
      "created_at": "2026-04-01T08:20:35.947Z",
      "updated_at": "2026-04-01T09:04:17.290Z",
      "deleted_at": null
    }
  }
}
```

---

## 7. Get Service Types

Returns the list of available service type options used when registering a business.

**Endpoint:** `GET /v1/getservicetypes`  
**Auth:** Not required.

**Success Response — `200 OK`:**

```json
{
  "success": true,
  "message": "Service types fetched successfully",
  "data": [
    {
      "id": 1,
      "name": "Wedding",
      "slug": "wedding",
      "icon": "💍",
      "status": 1
    },
    {
      "id": 2,
      "name": "Corporate",
      "slug": "corporate",
      "icon": "🏢",
      "status": 1
    },
    {
      "id": 3,
      "name": "Birthday",
      "slug": "birthday",
      "icon": "🎂",
      "status": 1
    },
    {
      "id": 4,
      "name": "Festival",
      "slug": "festival",
      "icon": "🎉",
      "status": 1
    }
  ]
}
```

---

## Error Response Format

All error responses across the API follow this unified structure:

```json
{
  "success": false,
  "message": "<Human-readable message>",
  "error": {
    "code": "<ERROR_CODE>",
    "message": "<Detailed error description>"
  }
}
```

**Common Error Codes:**

| Code | Description |
|---|---|
| `USER_EXISTS` | Email is already registered |
| `INVALID_OTP` | OTP is incorrect or has expired |
| `USER_NOT_FOUND` | No account found for the given email |
| `INVALID_CREDENTIALS` | Email or password is incorrect |
| `UNAUTHORIZED` | Missing or invalid auth token |
| `VALIDATION_ERROR` | One or more required fields are missing or malformed |
