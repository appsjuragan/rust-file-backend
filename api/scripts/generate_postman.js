const fs = require('fs');
const path = require('path');

/**
 * Postman Collection Generator for rust-file-backend
 * This script generates a comprehensive Postman collection JSON.
 */

const collection = {
    info: {
        name: "Rust File Backend API",
        description: "Comprehensive API collection for the Rust File Backend service. Includes File Management, Authentication, Chunked Uploads, and System endpoints.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: [],
    variable: [
        {
            key: "baseUrl",
            value: "http://localhost:3000",
            type: "string"
        },
        {
            key: "token",
            value: "",
            type: "string"
        }
    ]
};

// Helper to create a request
function createReq(name, method, urlPath, body = null, auth = true, description = "") {
    const req = {
        name: name,
        request: {
            method: method,
            header: [
                { key: "Content-Type", value: "application/json" }
            ],
            url: {
                raw: `{{baseUrl}}${urlPath}`,
                host: ["{{baseUrl}}"],
                path: urlPath.split('/').filter(p => p)
            },
            description: description
        }
    };

    if (auth) {
        req.request.header.push({
            key: "Authorization",
            value: "Bearer {{token}}"
        });
    }

    if (body) {
        req.request.body = {
            mode: "raw",
            raw: JSON.stringify(body, null, 2)
        };
    }

    return req;
}

// 1. AUTH PART
function getAuthFolder() {
    return {
        name: "Authentication",
        item: [
            createReq("Get Captcha", "GET", "/captcha", null, false, "Generate a mathematical CAPTCHA challenge."),
            createReq("Register", "POST", "/register", {
                username: "testuser",
                password: "password123",
                captcha_id: "{{captcha_id}}",
                captcha_answer: 10
            }, false, "Register a new user account."),
            createReq("Login", "POST", "/login", {
                username: "testuser",
                password: "password123",
                captcha_id: "{{captcha_id}}",
                captcha_answer: 10
            }, false, "Authenticate and receive a JWT token.")
        ]
    };
}

// 2. FILES PART
function getFilesFolder() {
    return {
        name: "File Management",
        item: [
            createReq("List Files", "GET", "/files?parent_id=root", null, true, "List files and folders. Use query params for filtering."),
            createReq("Get Folder Path", "GET", "/files/:id/path", null, true, "Get breadcrumbs for a folder."),
            createReq("Create Folder", "POST", "/folders", {
                name: "New Folder",
                parent_id: null
            }, true),
            createReq("Folder Tree", "GET", "/folders/tree", null, true, "Get recursive folder structure."),
            createReq("Rename/Move Item", "PUT", "/files/:id/rename", {
                name: "Updated Name",
                parent_id: null
            }, true),
            createReq("Delete Item", "DELETE", "/files/:id", null, true),
            createReq("ZIP Contents", "GET", "/files/:id/zip-contents", null, true, "List files inside an archive."),
            {
                name: "Bulk Operations",
                item: [
                    createReq("Bulk Delete", "POST", "/files/bulk-delete", { item_ids: ["id1", "id2"] }),
                    createReq("Bulk Move", "POST", "/files/bulk-move", { item_ids: ["id1"], parent_id: "folder_id" }),
                    createReq("Bulk Copy", "POST", "/files/bulk-copy", { item_ids: ["id1"], parent_id: "folder_id" })
                ]
            }
        ]
    };
}

// 3. UPLOADS PART
function getUploadsFolder() {
    return {
        name: "Uploads",
        item: [
            createReq("Pre-check (Dedup)", "POST", "/pre-check", {
                full_hash: "...",
                size: 1024,
                chunk_hashes: []
            }, true),
            {
                name: "Direct Upload (Multipart)",
                request: {
                    method: "POST",
                    header: [
                        { key: "Authorization", value: "Bearer {{token}}" }
                    ],
                    url: "{{baseUrl}}/upload",
                    body: {
                        mode: "formdata",
                        formdata: [
                            { key: "file", type: "file", src: [] },
                            { key: "parent_id", value: "root", type: "text" },
                            { key: "expiration_hours", value: "24", type: "text" }
                        ]
                    }
                }
            },
            createReq("Link Existing Storage File", "POST", "/files/link", {
                storage_file_id: "...",
                filename: "linked_file.txt",
                parent_id: null
            }),
            {
                name: "Chunked S3 Upload",
                item: [
                    createReq("Init Session", "POST", "/files/upload/init", {
                        file_name: "large_file.zip",
                        file_type: "application/zip",
                        total_size: 104857600
                    }),
                    createReq("Upload Chunk", "PUT", "/files/upload/:upload_id/chunk/:part_number", null, true, "Body should be binary data"),
                    createReq("Complete Upload", "POST", "/files/upload/:upload_id/complete", {
                        parent_id: null,
                        hash: "optional_file_hash"
                    }),
                    createReq("Abort Upload", "DELETE", "/files/upload/:upload_id"),
                    createReq("List Pending Sessions", "GET", "/files/upload/sessions")
                ]
            }
        ]
    };
}

// 4. DOWNLOADS PART
function getDownloadsFolder() {
    return {
        name: "Downloads",
        item: [
            createReq("Download File", "GET", "/files/:id"),
            createReq("Generate Download Ticket", "POST", "/files/:id/ticket", null, true, "Create a temporary ticket for unauthenticated download."),
            createReq("Download with Ticket", "GET", "/download/:ticket", null, false)
        ]
    };
}

// 5. USER & SETTINGS PART
function getUserFolder() {
    return {
        name: "User & Settings",
        item: [
            createReq("Get Profile", "GET", "/users/me"),
            createReq("Update Profile", "PUT", "/users/me", {
                name: "New Name",
                email: "user@example.com"
            }),
            createReq("Get User Facts", "GET", "/users/me/facts"),
            createReq("Get Settings", "GET", "/settings"),
            createReq("Update Settings", "PUT", "/settings", {
                theme: "dark",
                view_style: "grid"
            }),
            {
                name: "Avatar",
                item: [
                    createReq("Get Avatar", "GET", "/users/avatar/:user_id", null, false),
                    createReq("Get My Avatar", "GET", "/users/me/avatar", null, false),
                    {
                        name: "Upload Avatar",
                        request: {
                            method: "POST",
                            header: [
                                { key: "Authorization", value: "Bearer {{token}}" }
                            ],
                            url: "{{baseUrl}}/users/me/avatar",
                            body: {
                                mode: "formdata",
                                formdata: [
                                    { key: "file", type: "file", src: [] }
                                ]
                            }
                        }
                    }
                ]
            }
        ]
    };
}

// 6. SYSTEM PART
function getSystemFolder() {
    return {
        name: "System",
        item: [
            createReq("Health Check", "GET", "/health", null, false),
            createReq("Validation Rules", "GET", "/system/validation-rules", null, false)
        ]
    };
}

// Assemble
collection.item = [
    getAuthFolder(),
    getFilesFolder(),
    getUploadsFolder(),
    getDownloadsFolder(),
    getUserFolder(),
    getSystemFolder()
];

// Write to file
const outputPath = path.join(__dirname, '..', 'rust-file-backend.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log(`Successfully generated Postman collection at: ${outputPath}`);
