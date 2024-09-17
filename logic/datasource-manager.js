/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { readFileSync } from "fs";
import { sep } from "path";
import { connection } from "../utility/database.js";
import { ErrorResponse, ErrorCode } from "arbuscular";
import { createHash, createCipheriv, createDecipheriv, privateDecrypt, constants, publicEncrypt } from "crypto";
import { getOrganization } from "./organization-manager.js";

const privateKey = readFileSync("credentials"+sep+"private-key.pem");

// TODO: Change to a user-defined password
const PASSWORD_ENCRYPTION_KEY = "8CJ1D,y@";

/**
 * @typedef {object} Endpoint
 * @property {"Authenticate" | "GetFootprints" | "UpdateEvent"} type
 * @property {string} url
 */

/**
 * @typedef {object} DataSource
 * @property {number} dataSourceId
 * @property {string} userName
 * @property {string} password
 * @property {Array<Endpoint>} endpoints
 * @property {number} organizationId
 */

/**
 * @param {number} organizationId 
 * @param {"Pathfinder"} dataSourceType
 * @returns {Promise<DataSource|null>}
 */
export async function restoreDataSources(organizationId, dataSourceType) {
    let dataSources = await connection.select(
            "Endpoint.DataSourceId as dataSourceId", 
            "userName", 
            "password",
            "organizationId"
        )
        .from("Endpoint")
        .leftJoin("DataSource", "DataSource.DataSourceId", "Endpoint.DataSourceId")
        .where({OrganizationId: organizationId, DataSourceType: dataSourceType});
    if(dataSources.length == 0) return null;
    let dataSource = dataSources[0];
    if(dataSource.password != null) {
        dataSource.password = decryptForStorage(dataSource.password, organizationId.toString());
    }
    dataSource.endpoints = await connection.select("type", "url").from("Endpoint").where({DataSourceId: dataSource.dataSourceId});
    return dataSource;
}

/**
 * @type {import("arbuscular").handle}
 */
export async function updateDataSource(session, request) {
    let organizationId = session.organizationId;
    let userName = request.userName;
    let password = request.password;
    let endpoints = request.endpoints;

    userName = decryptForApplication(userName);
    password = decryptForApplication(password);
    endpoints = endpoints.map(endpoint => {
        endpoint.url = decryptForApplication(endpoint.url);
        return endpoint;
    });

    if(userName.length == 0) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "Invalid user name."}));
    }
    if(!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*\(\)\-_+\[\]{}|:;,.<>\/?])[a-zA-Z0-9!@#$%^&*\(\)\-_+\[\]{}|:;,.<>\/?]{8,32}$/.test(password)) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "Passwords must be at least 8 and no more than 32 characters long and contain all uppercase and lowercase letters, numbers, and symbols."}));
    }
    endpoints.forEach(endpoint => {
        if(!/^https?:\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/.test(endpoint.url)) {
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The URL format of the endpoint is invalid."}));
        }
    });
    if(!endpoints.some(endpoint => endpoint.type == "Authenticate")) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "Endpoint does not contain Action Authenticate."}));
    }
    if(!endpoints.some(endpoint => endpoint.type == "UpdateEvent")) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "Endpoint does not contain Action Events."}));
    }

    let transaction = await connection.transaction();
    try {
        let records = await transaction.select("dataSourceId").from("DataSource").where({OrganizationId: organizationId});
        let dataSourceId;
        if(records.length == 0) {
            let ids = await transaction.insert({
                DataSourceType: "Pathfinder",
                UserName: userName,
                Password: encryptForStorage(password, organizationId.toString()),
                OrganizationId: organizationId
            }).into("DataSource");
            if(ids.length != 1) throw ErrorResponse(ErrorCode.StateError, "Inserting failed.");
            dataSourceId = ids[0];
        }else {
            dataSourceId = records[0].dataSourceId;
            transaction("DataSource").update({
                UserName: userName,
                Password: password
            }).where({OrganizationId: organizationId, DataSourceId: dataSourceId});
        }
        if(endpoints != null) {
            await transaction("Endpoint").delete().where({DataSourceId: dataSourceId});
            await Promise.all(endpoints.map(async endpoint => {
                await transaction.insert({DataSourceId: dataSourceId, Type: endpoint.type, Url: endpoint.url}).into("Endpoint");
            }));
        }
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @type {import("arbuscular").handle}
 */
export async function deleteDataSource(session, request) {
    let organizationId = session.organizationId;
    let dataSourceId = request.dataSourceId;

    let transaction = await connection.transaction();
    try {
        await transaction("DataSource").delete().where({DataSourceId: dataSourceId, OrganizationId: organizationId});
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @param {string} password 
 * @param {string} solt 
 * @returns {Buffer}
 */
function encryptForStorage(password, solt) {
    let key = createHash("sha256");
    key.update(PASSWORD_ENCRYPTION_KEY);
    let _key = key.digest();

    let iv = createHash("md5");
    iv.update(solt);
    let _iv = iv.digest();

    let cipher = createCipheriv("aes-256-cbc", _key, _iv);
    return Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
}

/**
 * @param {Buffer} password 
 * @param {string} solt 
 * @returns {string}
 */
function decryptForStorage(password, solt) {
    let key = createHash("sha256");
    key.update(PASSWORD_ENCRYPTION_KEY);
    let _key = key.digest();

    let iv = createHash("md5");
    iv.update(solt);
    let _iv = iv.digest();

    let decipher = createDecipheriv("aes-256-cbc", _key, _iv);
    return decipher.update(password) + decipher.final("utf8");
}

/**
 * @param {string} string 
 * @returns {string}
 */
function decryptForApplication(string) {
    let encryptedData = Buffer.from(string, "base64");
    let decryptedData = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING }, encryptedData);
    return decryptedData.toString();
}