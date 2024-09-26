/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { ErrorResponse, ErrorCode } from "arbuscular";
import { generateKeyPair } from "crypto";
import { connection } from "../utility/database.js";

/**
 * @type {import("arbuscular").handle}
 */
export async function generatePublicKey(session, request) {
    let organizationId = session.organizationId;
    return new Promise((resolve, reject) => {
        generateKeyPair("rsa", {
            modulusLength: 2024,
            privateKeyEncoding: { format: "pem", type: "pkcs1" }, 
            publicKeyEncoding: { format: "pem", type: "pkcs1" }
        }, (error, publicKey, privateKey) => {
            if(error != null) {
                reject(error);
                return;
            }
            addPublicKey(organizationId, publicKey).then(() => {
                resolve({publicKey: publicKey, privateKey: privateKey});
            }).catch(reject);
        });
    });
}

/**
 * @type {import("arbuscular").handle}
 */
export async function updatePublicKey(session, request) {
    let organizationId = session.organizationId;
    let publicKey = request.publicKey;
    await addPublicKey(organizationId, publicKey);
}

/**
 * @param {number} organizationId 
 * @param {string} publicKey 
 */
async function addPublicKey(organizationId, publicKey) {
    if(organizationId == null || publicKey == null || publicKey.length == 0) {
        throw ErrorResponse(ErrorCode.StateError, "Invalid state.");
    }
    let transaction = await connection.transaction();
    try {
        await transaction("Organization").update({
            PublicKey: publicKey
        }).where({OrganizationId: organizationId});
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @type {import("arbuscular").handle}
 */
export async function deletePublicKey(session, request) {
    let organizationId = session.organizationId;
    let transaction = await connection.transaction();
    try {
        await transaction("Organization").update({
            PublicKey: null
        }).where({OrganizationId: organizationId});
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}