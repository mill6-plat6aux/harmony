/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { readFileSync } from "fs";
import { sep } from "path";
import { createHash, createSign } from "crypto";
import { ErrorResponse, ErrorCode, writeError } from "arbuscular";
import { connection } from "../utility/database.js";
import { request } from "../utility/http.js";
import { restoreDataSources } from "./datasource-manager.js";
import { getOrganization, searchOrganization, updateOrganization } from "./organization-manager.js";
import { updateProduct } from "./product-manager.js";
import { getProductFootprint, updateProductFootprint } from "./product-footprint-manager.js";

const privateKey = readFileSync("credentials"+sep+"private-key.pem");

/**
 * @type {import("arbuscular").handle}
 */
export async function handleEvent(session, request) {
    let organizationId = session.organizationId;
    let userId = session.userId;

    let type = request.type;
    let source = request.source;
    let eventId = request.id;
    let data = request.data;

    if(type == null || typeof type != "string") {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The type property is not defined in the request."}));
    }

    if(source == null || typeof source != "string") {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The source property is not defined in the request."}));
    }
    if(source.startsWith("//")) {
        source = "https:"+source;
    }
    if(!/\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}\b([-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/.test(source)) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The source property must be Action Events of your system."}));
    }

    if(eventId == null || typeof eventId != "string") {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The eventId property is not defined in the request."}));
    }
    
    if(data == null || typeof data != "object") {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The data property is not defined in the request."}));
    }

    if(type == "org.wbcsd.pathfinder.Company.Updated.v1") {
        await handleCompanyUpdated(organizationId, data);
    }else if(type == "org.wbcsd.pathfinder.Product.Updated.v1") {
        await handleProductUpdated(organizationId, data);
    }else if(type == "org.wbcsd.pathfinder.ProductFootprint.Updated.v1") {
        await handleProductFootprintUpdated(organizationId, data);
    }else if(type == "org.wbcsd.pathfinder.Contract.Request.v1") {
        await handleContractRequest(organizationId, request);
    }else if(type == "org.wbcsd.pathfinder.Contract.Reply.v1") {
        await handleContractReply(organizationId, request);
    }
}

/**
 * @param {number} organizationId 
 * @param {object} data 
 */
async function handleCompanyUpdated(organizationId, data) {
    await updateOrganization(organizationId, data.companyName, data.companyIds);
}

/**
 * @param {number} organizationId 
 * @param {object} data 
 */
async function handleProductUpdated(organizationId, data) {
    await updateProduct(organizationId, data.productNameCompany, data.productIds);
}

/**
 * @param {number} organizationId 
 * @param {object} data 
 */
async function handleProductFootprintUpdated(organizationId, data) {
    await updateProductFootprint(organizationId, data.companyName, data.companyIds, data.productNameCompany, data.productIds, data.id);
}

/**
 * @param {number} organizationId 
 * @param {object} request 
 */
async function handleContractRequest(organizationId, request) {
    let organization = await getOrganization(organizationId);
    if(organization == null) {
        throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "InternalError", message: "Invalid state."}));
    }

    let requestor = request.data.requestor;
    requestor.publicKey = organization.publicKey;

    let requestee = request.data.requestee;
    if(requestee.companyName == null && requestee.companyIds == null &&
        requestee.productNameCompany == null && requestee.productIds == null &&
        requestee.id == null) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "One or more of the requested properties must be set under the requestee property."}));
    }
    
    let organizationIds = [];
    if(requestee.id != null) {
        let productFootprint = await getProductFootprint(requestee.id);
        if(productFootprint != null) {
            organizationIds.push(productFootprint.organizationId);
        }
    }
    if(requestee.companyName != null || requestee.companyIds != null) {
        let organizations = await searchOrganization(requestee.companyName, requestee.companyIds);
        if(organizations.length > 0) {
            organizations.forEach(organization => {
                organizationIds.push(organization.organizationId);
            });
        }
    }
    if(organizationIds.length == 0) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The company associated with the data specified in the requestee property is not registered."}));
    }
    let dataSources = await Promise.all(organizationIds.map(async organizationId => {
        return await restoreDataSources(organizationId, "Pathfinder");
    }));
    dataSources = dataSources.filter(dataSource => {
        if(dataSource == null) {
            return false;
        }
        if(dataSource.userName == null || dataSource.password == null) {
            return false;
        }
        if(dataSource.endpoints.findIndex(endpoint => endpoint.type == "Authenticate") == -1) {
            return false;
        }
        if(dataSource.endpoints.findIndex(endpoint => endpoint.type == "UpdateEvent") == -1) {
            return false;
        }
        return true;
    });
    if(dataSources.length == 0) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The company associated with the data specified in the requestee property is not registered."}));
    }

    let requestorDataSource = await restoreDataSources(organizationId, "Pathfinder");
    if(requestorDataSource == null) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The requestor's data source is not registered."}));
    }
    
    await Promise.all(dataSources.map(async dataSource => {
        if(dataSource == null) return;
        let authenticateEndpoint = dataSource.endpoints.find(endpoint => endpoint.type == "Authenticate");
        let updateEventEndpoint = dataSource.endpoints.find(endpoint => endpoint.type == "UpdateEvent");
        if(authenticateEndpoint == null || updateEventEndpoint == null) return;

        let storedRequest = await restoreRequest(request.id, request.source);
        if(storedRequest != null) {
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "A request for the same event ID has already been received."}));
        }

        let accessToken = await getAccessToken(authenticateEndpoint.url, dataSource.userName, dataSource.password);

        await requestToRemote("post", updateEventEndpoint.url, accessToken, "application/cloudevents+json; charset=UTF-8", request);

        await storeRequest("Contract", request.id, request.source, organizationId, dataSource.organizationId);
    }));
}

/**
 * @param {number} organizationId 
 * @param {object} request 
 */
async function handleContractReply(organizationId, request) {
    let storedRequest = await restoreRequest(request.data.requestEventId, request.data.requestSource);
    if(storedRequest == null) {
        throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "Request corresponding to the specified event ID has not been received."}));
    }
    let dataSource = await restoreDataSources(storedRequest.requestorOrganizationId, "Pathfinder");
    if(dataSource == null) {
        throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "InternalError", message: "Invalid state."}));
    }

    let authenticateEndpoint = dataSource.endpoints.find(endpoint => endpoint.type == "Authenticate");
    let updateEventEndpoint = dataSource.endpoints.find(endpoint => endpoint.type == "UpdateEvent");
    if(authenticateEndpoint == null || updateEventEndpoint == null) return;

    let accessToken = await getAccessToken(authenticateEndpoint.url, dataSource.userName, dataSource.password);

    await requestToRemote("post", updateEventEndpoint.url, accessToken, "application/cloudevents+json; charset=UTF-8", request);

    await disposeRequest(storedRequest.requestId);
}

/**
 * @param {string} url 
 * @param {string} userName 
 * @param {string} password 
 * @returns {Promise<string>}
 */
async function getAccessToken(url, userName, password) {
    let response = await request("post", url, {
        host: new URL(url).hostname,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(userName+":"+password).toString("base64")
    }, {grant_type: "client_credentials"});
    if(response.status != 200) {
        writeError(`An error occurred in authentication to an external application. URL: ${url} Status: ${response.status}`);
        throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "InternalError", message: "An error occurred in authentication to an external application."}));
    }
    if(response.body == null || response.body.access_token == null) {
        writeError(`Authentication to the external application was successful, but the access token could not be obtained. URL: ${url} Status: ${(typeof response.body == "object" ? JSON.stringify(response.body) : response.body)}`);
        throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "InternalError", message: "Authentication to the external application was successful, but the access token could not be obtained."}));
    }
    return response.body.access_token;
}

/**
 * @param {"get"|"post"|"patch"|"put"|"delete"|"option"|"head"} method 
 * @param {string} requestPath 
 * @param {string} accessToken 
 * @param {string} [contentType] 
 * @param {object} [requestBody] 
 * @returns {Promise<object>}
 */
export async function requestToRemote(method, requestPath, accessToken, contentType, requestBody) {
    let url = new URL(requestPath);

    let contentDigestLabel = "sha-256";
    let contentDigest;
    if(requestBody != null && typeof requestBody == "object") {
        contentDigest = createHash("SHA256").update(JSON.stringify(requestBody)).digest("base64");
    }

    let signLabel = "sig1";
    let signInput = `${signLabel}=("@method" "@authority" "@path"`;
    if(contentDigest != null) {
        signInput += ` "content-digest"`;
    }
    signInput += `);created=${new Date().getTime()};alg="rsa-v1_5-sha256"`;
    let signData = `"@method": ${method}\n"@authority": ${url.hostname}\n"@path": ${url.pathname}`;
    if(contentDigest != null) {
        signData += `\n"content-digest": ${contentDigestLabel}=:${contentDigest}:`;
    }
    let signature = createSign("SHA256").update(signData).end().sign(privateKey, "base64");

    let requestHeader = {
        host: url.hostname,
        authorization: "Bearer " + accessToken,
        "content-type": contentType,
        "content-digest": `${contentDigestLabel}=:${contentDigest}:`,
        "signature-input": signInput,
        "signature": `${signLabel}=:${signature}:`
    };

    let response = await request(method, requestPath, requestHeader, requestBody);
    if(response.status != 200) {
        writeError(`The application returned an error. Status:${response.status} Response:${JSON.stringify(response.body)} URL:${requestPath}`)
        throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "InternalError", message: `The application returned an error.`}));
    }

    return response.body;
}

/**
 * @param {"Contract"} requestType 
 * @param {string} eventId 
 * @param {string} source 
 * @param {number} requestorOrganizationId 
 * @param {number} requesteeOrganizationId 
 */
async function storeRequest(requestType, eventId, source, requestorOrganizationId, requesteeOrganizationId) {
    let transaction = await connection.transaction();
    try {
        await transaction.insert({
            RequestType: requestType,
            EventId: eventId, 
            Source: source, 
            RequestorOrganizationId: requestorOrganizationId, 
            RequesteeOrganizationId: requesteeOrganizationId,
            UpdatedTime: new Date()
        }).into("Request");
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @typedef {object} Request
 * @property {number} requestId
 * @property {number} requestorOrganizationId
 * @property {number} requesteeOrganizationId
 */

/**
 * @param {string} eventId 
 * @param {string} source 
 * @returns {Promise<Request|null>}
 */
async function restoreRequest(eventId, source) {
    let records = await connection.select(
        "requestId", 
        "requestorOrganizationId", 
        "requesteeOrganizationId"
    ).from("Request").where({EventId: eventId, Source: source});
    return records.length > 0 ? records[0] : null;
}

/**
 * @param {number} requestId 
 */
async function disposeRequest(requestId) {
    let transaction = await connection.transaction();
    try {
        await transaction.delete().from("Request").where({RequestId: requestId});
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}